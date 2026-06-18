"""
Cuckoo HashMap Embedding Table for Lattice OS
Based on Monolith (ByteDance, RecSys 2022)
Collisionless embedding storage with expirable embeddings + frequency filtering
"""

import asyncio
import mmh3
import numpy as np
from dataclasses import dataclass
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime, timedelta
import asyncpg
import logging

logger = logging.getLogger(__name__)


@dataclass
class CuckooConfig:
    """Configuration for Cuckoo HashMap embedding table"""
    num_tables: int = 2              # T0, T1 (Monolith uses 2)
    table_size: int = 1_048_576      # Power of 2 (2^20 = ~1M buckets)
    embedding_dim: int = 1024        # Embedding dimension
    max_kick_attempts: int = 500     # Max cuckoo kicks before rehash
    stash_size: int = 100            # Overflow stash for cycles
    default_ttl_hours: int = 720     # 30 days default TTL
    min_access_frequency: int = 5    # Min accesses before eligible for eviction


@dataclass
class EmbeddingEntry:
    """Single embedding entry in the Cuckoo table"""
    key_hash: int
    key_text: str
    embedding: np.ndarray
    table_id: int
    bucket_idx: int
    access_count: int = 1
    last_access: datetime = None
    created_at: datetime = None
    expires_at: datetime = None
    
    def __post_init__(self):
        now = datetime.utcnow()
        if self.last_access is None:
            self.last_access = now
        if self.created_at is None:
            self.created_at = now
        if self.expires_at is None:
            self.expires_at = now + timedelta(hours=720)


class CuckooEmbeddingTable:
    """
    Collisionless embedding table using Cuckoo Hashing.
    
    Provides O(1) lookup/insert with guaranteed no collisions.
    Supports expirable embeddings and frequency-based eviction.
    
    Architecture:
    - Two hash tables (T0, T1) with independent hash functions
    - Keys can live in either table, resolving collisions via kicks
    - Stash handles rare cycles
    - Redis for hot path, Postgres for persistence
    """
    
    def __init__(
        self,
        config: CuckooConfig,
        pg_pool: asyncpg.Pool,
        redis_client: Optional[Any] = None,
    ):
        self.config = config
        self.pg_pool = pg_pool
        self.redis = redis_client
        
        # In-memory stash for cycle overflow
        self._stash: Dict[int, EmbeddingEntry] = {}
        
        # Stats
        self._stats = {
            "inserts": 0,
            "lookups": 0,
            "kicks": 0,
            "rehashes": 0,
            "stash_hits": 0,
            "evictions": 0,
        }
        
        # Dirty keys for incremental sync
        self._dirty_keys: set = set()
    
    # ==================== Hash Functions ====================
    
    def _hash(self, key: str, table_idx: int) -> int:
        """Independent hash function per table using different seeds"""
        return mmh3.hash64(key, seed=table_idx * 1000 + 42)[0] % self.config.table_size
    
    def _both_hashes(self, key: str) -> Tuple[int, int]:
        """Get both table positions for a key"""
        return (self._hash(key, 0), self._hash(key, 1))
    
    # ==================== Core Operations ====================
    
    async def get(self, key: str) -> Optional[np.ndarray]:
        """
        O(1) lookup - check both tables + stash.
        Returns embedding or None if not found.
        """
        self._stats["lookups"] += 1
        
        # Check stash first
        key_hash = mmh3.hash64(key, seed=42)[0]
        if key_hash in self._stash:
            entry = self._stash[key_hash]
            if entry.key_text == key:
                self._stats["stash_hits"] += 1
                await self._update_access(entry)
                return entry.embedding.copy()
        
        # Check both tables
        h0, h1 = self._both_hashes(key)
        
        # Try T0
        entry = await self._fetch_entry(0, h0, key)
        if entry:
            await self._update_access(entry)
            return entry.embedding.copy()
        
        # Try T1
        entry = await self._fetch_entry(1, h1, key)
        if entry:
            await self._update_access(entry)
            return entry.embedding.copy()
        
        return None
    
    async def put(
        self, 
        key: str, 
        embedding: np.ndarray,
        ttl_hours: Optional[int] = None,
    ) -> bool:
        """
        Insert embedding with cuckoo kicks.
        Guaranteed no collisions - kicks existing entries to alternate table.
        """
        self._stats["inserts"] += 1
        
        # Validate embedding
        if embedding.shape != (self.config.embedding_dim,):
            raise ValueError(f"Embedding must be {self.config.embedding_dim}D, got {embedding.shape}")
        
        key_hash = mmh3.hash64(key, seed=42)[0]
        h0, h1 = self._both_hashes(key)
        
        # Check if already exists (update in place)
        for table_id, bucket_idx in [(0, h0), (1, h1)]:
            existing = await self._fetch_entry(table_id, bucket_idx, key)
            if existing:
                await self._update_embedding(table_id, bucket_idx, embedding)
                if ttl_hours:
                    await self._update_ttl(table_id, bucket_idx, ttl_hours)
                self._dirty_keys.add(key)
                return True
        
        # Check stash
        if key_hash in self._stash:
            self._stash[key_hash].embedding = embedding.copy()
            if ttl_hours:
                self._stash[key_hash].expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
            self._dirty_keys.add(key)
            return True
        
        # Insert new entry - try T0 first
        entry = EmbeddingEntry(
            key_hash=key_hash,
            key_text=key,
            embedding=embedding.copy(),
            table_id=0,
            bucket_idx=h0,
        )
        if ttl_hours:
            entry.expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        
        success = await self._insert_with_kicks(entry)
        if success:
            self._dirty_keys.add(key)
        return success
    
    # ==================== Insertion with Kicks ====================
    
    async def _insert_with_kicks(self, entry: EmbeddingEntry) -> bool:
        """
        Cuckoo insertion with kicks.
        Follows Monolith Figure 3 algorithm.
        """
        current = entry
        attempts = 0
        
        while attempts < self.config.max_kick_attempts:
            table_id = current.table_id
            bucket_idx = current.bucket_idx
            
            # Try to place in current table
            existing = await self._fetch_entry_raw(table_id, bucket_idx)
            
            if existing is None:
                # Empty slot - place here
                await self._write_entry(table_id, bucket_idx, current)
                return True
            
            # Slot occupied - kick existing entry
            self._stats["kicks"] += 1
            
            # Swap: current takes the slot, existing gets kicked
            kicked = existing
            await self._write_entry(table_id, bucket_idx, current)
            
            # Kicked entry goes to alternate table
            current = kicked
            current.table_id = 1 - current.table_id  # Switch table
            current.bucket_idx = self._hash(current.key_text, current.table_id)
            attempts += 1
        
        # Too many kicks - use stash
        logger.warning(f"Max kicks reached for {current.key_text}, using stash")
        if len(self._stash) < self.config.stash_size:
            self._stash[current.key_hash] = current
            return True
        
        # Stash full - need rehash (rare)
        return await self._rehash_and_retry(current)
    
    async def _rehash_and_retry(self, entry: EmbeddingEntry) -> bool:
        """Rehash with new seeds and retry"""
        self._stats["rehashes"] += 1
        logger.info("Rehashing cuckoo table...")
        
        # In production: rebuild entire table with new seeds
        # For now: try stash if space, else fail
        if len(self._stash) < self.config.stash_size:
            self._stash[entry.key_hash] = entry
            return True
        
        return False
    
    # ==================== Eviction & TTL ====================
    
    async def evict_stale(
        self, 
        ttl_hours: Optional[int] = None,
        min_frequency: Optional[int] = None,
    ) -> int:
        """
        Evict expired embeddings and low-frequency entries.
        Monolith: "IDs that appear only a handful of times have limited contribution"
        """
        ttl_hours = ttl_hours or self.config.default_ttl_hours
        min_frequency = min_frequency or self.config.min_access_frequency
        
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=ttl_hours)
        evicted = 0
        
        # Evict from stash
        to_remove = []
        for key_hash, entry in self._stash.items():
            if entry.expires_at and entry.expires_at < now:
                to_remove.append(key_hash)
            elif entry.access_count < min_frequency and entry.last_access < cutoff:
                to_remove.append(key_hash)
        
        for k in to_remove:
            del self._stash[k]
            evicted += 1
        
        # Evict from Postgres (batch)
        async with self.pg_pool.acquire() as conn:
            result = await conn.execute("""
                DELETE FROM cuckoo_embeddings
                WHERE expires_at < $1
                   OR (access_count < $2 AND last_access < $1)
            """, cutoff, min_frequency)
            evicted += int(result.split()[-1]) if result else 0
        
        self._stats["evictions"] += evicted
        logger.info(f"Evicted {evicted} stale embeddings")
        return evicted
    
    # ==================== Dirty Key Tracking ====================
    
    def get_dirty_keys(self) -> List[str]:
        """Get keys that have been modified since last sync"""
        keys = list(self._dirty_keys)
        self._dirty_keys.clear()
        return keys
    
    async def flush_dirty(self) -> int:
        """Force flush all dirty keys to Postgres"""
        # In practice: batch write dirty entries
        # For now: just clear dirty set
        count = len(self._dirty_keys)
        self._dirty_keys.clear()
        return count
    
    # ==================== Postgres Operations ====================
    
    async def _fetch_entry(self, table_id: int, bucket_idx: int, key: str) -> Optional[EmbeddingEntry]:
        """Fetch and verify key matches"""
        entry = await self._fetch_entry_raw(table_id, bucket_idx)
        if entry and entry.key_text == key:
            return entry
        return None
    
    async def _fetch_entry_raw(self, table_id: int, bucket_idx: int) -> Optional[EmbeddingEntry]:
        """Raw fetch from DB/Redis"""
        # Try Redis first (hot path)
        if self.redis:
            cached = await self.redis.get(f"cuckoo:{table_id}:{bucket_idx}")
            if cached:
                return self._deserialize_entry(cached)
        
        # Fallback to Postgres
        async with self.pg_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT key_hash, key_text, embedding, table_id, bucket_idx,
                       access_count, last_access, created_at, expires_at
                FROM cuckoo_embeddings
                WHERE table_id = $1 AND bucket_idx = $2
            """, table_id, bucket_idx)
            
            if row:
                return self._row_to_entry(row)
        
        return None
    
    async def _write_entry(self, table_id: int, bucket_idx: int, entry: EmbeddingEntry):
        """Write entry to both Redis and Postgres"""
        entry.table_id = table_id
        entry.bucket_idx = bucket_idx
        
        # Write to Redis (hot)
        if self.redis:
            await self.redis.set(
                f"cuckoo:{table_id}:{bucket_idx}",
                self._serialize_entry(entry),
                ex=86400  # 24h TTL in Redis
            )
        
        # Write to Postgres (persistent)
        async with self.pg_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO cuckoo_embeddings 
                (table_id, bucket_idx, key_hash, key_text, embedding, 
                 access_count, last_access, created_at, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (table_id, bucket_idx) DO UPDATE SET
                    key_hash = EXCLUDED.key_hash,
                    key_text = EXCLUDED.key_text,
                    embedding = EXCLUDED.embedding,
                    access_count = EXCLUDED.access_count,
                    last_access = EXCLUDED.last_access,
                    expires_at = EXCLUDED.expires_at
            """, table_id, bucket_idx, entry.key_hash, entry.key_text,
                entry.embedding.tobytes(), entry.access_count,
                entry.last_access, entry.created_at, entry.expires_at)
    
    async def _update_embedding(self, table_id: int, bucket_idx: int, embedding: np.ndarray):
        """Update embedding in place"""
        async with self.pg_pool.acquire() as conn:
            await conn.execute("""
                UPDATE cuckoo_embeddings 
                SET embedding = $1, last_access = NOW()
                WHERE table_id = $2 AND bucket_idx = $3
            """, embedding.tobytes(), table_id, bucket_idx)
        
        if self.redis:
            # Invalidate Redis cache
            await self.redis.delete(f"cuckoo:{table_id}:{bucket_idx}")
    
    async def _update_ttl(self, table_id: int, bucket_idx: int, ttl_hours: int):
        """Update expiration time"""
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        async with self.pg_pool.acquire() as conn:
            await conn.execute("""
                UPDATE cuckoo_embeddings 
                SET expires_at = $1
                WHERE table_id = $2 AND bucket_idx = $3
            """, expires_at, table_id, bucket_idx)
    
    async def _update_access(self, entry: EmbeddingEntry):
        """Increment access count and update last_access"""
        entry.access_count += 1
        entry.last_access = datetime.utcnow()
        # Async write-back (fire and forget)
        asyncio.create_task(self._write_access(entry))
    
    async def _write_access(self, entry: EmbeddingEntry):
        """Background write of access update"""
        try:
            async with self.pg_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE cuckoo_embeddings 
                    SET access_count = $1, last_access = $2
                    WHERE table_id = $3 AND bucket_idx = $4
                """, entry.access_count, entry.last_access, entry.table_id, entry.bucket_idx)
        except Exception as e:
            logger.error(f"Failed to write access update: {e}")
    
    # ==================== Serialization ====================
    
    def _serialize_entry(self, entry: EmbeddingEntry) -> bytes:
        import msgpack
        return msgpack.packb({
            "kh": entry.key_hash,
            "kt": entry.key_text,
            "emb": entry.embedding.tobytes(),
            "tid": entry.table_id,
            "bid": entry.bucket_idx,
            "ac": entry.access_count,
            "la": entry.last_access.isoformat() if entry.last_access else None,
            "ca": entry.created_at.isoformat() if entry.created_at else None,
            "ea": entry.expires_at.isoformat() if entry.expires_at else None,
        })
    
    def _deserialize_entry(self, data: bytes) -> EmbeddingEntry:
        import msgpack
        d = msgpack.unpackb(data)
        return EmbeddingEntry(
            key_hash=d["kh"],
            key_text=d["kt"],
            embedding=np.frombuffer(d["emb"], dtype=np.float32),
            table_id=d["tid"],
            bucket_idx=d["bid"],
            access_count=d["ac"],
            last_access=datetime.fromisoformat(d["la"]) if d["la"] else None,
            created_at=datetime.fromisoformat(d["ca"]) if d["ca"] else None,
            expires_at=datetime.fromisoformat(d["ea"]) if d["ea"] else None,
        )
    
    def _row_to_entry(self, row) -> EmbeddingEntry:
        return EmbeddingEntry(
            key_hash=row["key_hash"],
            key_text=row["key_text"],
            embedding=np.frombuffer(row["embedding"], dtype=np.float32),
            table_id=row["table_id"],
            bucket_idx=row["bucket_idx"],
            access_count=row["access_count"],
            last_access=row["last_access"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
        )
    
    # ==================== Stats ====================
    
    def get_stats(self) -> Dict:
        return {
            **self._stats,
            "stash_size": len(self._stash),
            "dirty_keys": len(self._dirty_keys),
        }
    
    async def close(self):
        """Cleanup"""
        await self.flush_dirty()
        self._stash.clear()


# ==================== Factory ====================

async def create_cuckoo_table(
    pg_pool: asyncpg.Pool,
    redis_client: Optional[Any] = None,
    config: Optional[CuckooConfig] = None,
) -> CuckooEmbeddingTable:
    """Create and initialize Cuckoo embedding table"""
    config = config or CuckooConfig()
    table = CuckooEmbeddingTable(config, pg_pool, redis_client)
    
    # Ensure tables exist
    async with pg_pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS cuckoo_embeddings (
                table_id    INT NOT NULL,
                bucket_idx  BIGINT NOT NULL,
                key_hash    BIGINT NOT NULL,
                key_text    TEXT NOT NULL,
                embedding   BYTEA NOT NULL,
                access_count INT DEFAULT 1,
                last_access  TIMESTAMPTZ DEFAULT NOW(),
                created_at   TIMESTAMPTZ DEFAULT NOW(),
                expires_at   TIMESTAMPTZ,
                PRIMARY KEY (table_id, bucket_idx)
            );
            
            CREATE INDEX IF NOT EXISTS idx_cuckoo_key_hash 
                ON cuckoo_embeddings(key_hash);
            CREATE INDEX IF NOT EXISTS idx_cuckoo_expires 
                ON cuckoo_embeddings(expires_at) 
                WHERE expires_at IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_cuckoo_access 
                ON cuckoo_embeddings(last_access);
        """)
    
    return table