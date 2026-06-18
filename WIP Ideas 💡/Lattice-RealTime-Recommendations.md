# Real-Time Recommendations in Lattice OS
**Based on: "Monolith: Real Time Recommendation System With Collisionless Embedding Table" (ByteDance, RecSys 2022)**

---

## Paper Summary: Key Innovations

| Innovation | What It Solves | Lattice Application |
|------------|---------------|---------------------|
| **Collisionless Embedding Table (Cuckoo HashMap)** | Hash collisions degrade model quality as embedding table grows | Replace fixed-size embedding tables in Lattice's user/item memory |
| **Expirable Embeddings + Frequency Filtering** | Memory explosion from long-tail IDs | Auto-evict stale user preferences, inactive items |
| **Online Training (Streaming)** | Batch training = stale model, concept drift | Continuous learning from user interactions in real-time |
| **Minute-Level Parameter Sync** | Trade reliability for freshness | Sync UCOL memory → serving layer every minute |
| **Fault-Tolerant PS Design** | PS failures lose updates | Graceful degradation when memory shards fail |

---

## Lattice Architecture Mapping

```
Monolith Component          →  Lattice Equivalent
─────────────────────────────────────────────────────────────────
Embedding Table (Cuckoo)    →  UCOL Procedural Memory (Supabase vector + graph)
Expirable Embeddings        →  TTL on memory entries + access-frequency decay
Frequency Filtering         →  Only persist patterns used > N times
Online Training (Flink)     →  Hermes cron + delegation pipeline (real-time)
Parameter Server (PS)       →  Lattice Memory Bridge (sync to serving)
Serving PS                  →  vLLM/Lattice-1 inference endpoint
Batch Training (HDFS)       →  Periodic full retraining from Supabase
Streaming Engine (Kafka)    →  Event bus: user actions → feature joiner → training
```

---

## Implementation Plan for Lattice

### Phase 1: Collisionless Memory Layer (Week 1-2)

**Problem**: Current Lattice uses fixed-dimension vectors in Supabase. As users/items grow, collisions occur implicitly via dimensionality limits.

**Solution**: Implement Cuckoo HashMap-based embedding storage

```python
# lib/realtime/cuckoo_embedding.py
import mmh3
import numpy as np
from dataclasses import dataclass
from typing import Optional, Tuple
import asyncpg

@dataclass
class CuckooConfig:
    num_tables: int = 2           # T0, T1 (like paper)
    table_size: int = 1_000_000   # Power of 2
    embedding_dim: int = 1024
    max_kick_attempts: int = 500
    stash_size: int = 100         # Overflow for cycles

class CuckooEmbeddingTable:
    """
    Collisionless embedding table using Cuckoo Hashing.
    Maps arbitrary ID → embedding vector with O(1) lookup.
    """
    
    def __init__(self, config: CuckooConfig, pool: asyncpg.Pool):
        self.config = config
        self.pool = pool
        self._init_tables()
    
    def _init_tables(self):
        # Tables stored as bytea in Postgres for efficiency
        # Or use Redis for hot path, Postgres for persistence
        pass
    
    def _hash(self, key: str, table_idx: int) -> int:
        """Two independent hash functions using different seeds"""
        return mmh3.hash64(key, seed=table_idx)[0] % self.config.table_size
    
    async def get(self, key: str) -> Optional[np.ndarray]:
        """O(1) lookup - check both tables"""
        for t in range(self.config.num_tables):
            idx = self._hash(key, t)
            emb = await self._fetch_embedding(t, idx, key)
            if emb is not None:
                return emb
        return None
    
    async def put(self, key: str, embedding: np.ndarray) -> bool:
        """Insert with cuckoo kicks - guaranteed no collision"""
        # Implementation follows paper Figure 3
        pass
    
    async def evict_stale(self, ttl_hours: int = 168, min_freq: int = 5):
        """
        Expirable embeddings: remove IDs inactive > ttl_hours
        Frequency filtering: remove IDs with < min_freq accesses
        """
        pass
```

**Supabase Schema Extension**:
```sql
-- Add to supabase_schema.sql
CREATE TABLE cuckoo_embeddings_v2 (
    table_id    INT NOT NULL,           -- 0 or 1
    bucket_idx  BIGINT NOT NULL,
    key_hash    BIGINT NOT NULL,        -- mmh3 hash for verification
    key_text    TEXT NOT NULL,          -- Original ID for debugging
    embedding   VECTOR(1024) NOT NULL,
    access_count INT DEFAULT 1,
    last_access  TIMESTAMPTZ DEFAULT NOW(),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    expires_at   TIMESTAMPTZ,
    PRIMARY KEY (table_id, bucket_idx)
);

CREATE INDEX idx_cuckoo_key_hash ON cuckoo_embeddings_v2(key_hash);
CREATE INDEX idx_cuckoo_expires ON cuckoo_embeddings_v2(expires_at) 
    WHERE expires_at IS NOT NULL;
```

---

### Phase 2: Real-Time Streaming Pipeline (Week 2-3)

**Architecture** (mirrors Monolith Figure 4):

```
User Action (click, like, save, share)
       │
       ▼
┌──────────────────┐
│  Event Ingestion │  (Hermes webhook / API route)
│  /api/events     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Kafka/Redis     │  (Action log + Feature log topics)
│  Streams         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Online Joiner   │  (Flink → replace with custom async joiner)
│  Join user action│  Key = request_id
│  with features   │  Cache features in Redis (TTL 7 days)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Training Queue  │  Kafka topic: training_examples
│  (per user/item) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Online Trainer  │  Hermes cron (every 1-5 min)
│  PG/SGD update   │  Read batch → gradient → update Cuckoo table
└────────┬─────────┘
         │
         ▼ (Parameter Sync)
┌──────────────────┐
│  Serving Layer   │  vLLM + UCOL memory cache
│  Lattice-1 + UCOL│  Updated every minute
└──────────────────┘
```

**Implementation**:
```python
# lib/realtime/streaming.py
import asyncio
import redis.asyncio as redis
from dataclasses import dataclass
from typing import List, Dict
import json

@dataclass
class UserAction:
    user_id: str
    item_id: str
    action_type: str  # click, like, save, share, dwell
    request_id: str   # For joining with features
    timestamp: int
    metadata: Dict

@dataclass  
class FeatureVector:
    request_id: str
    user_features: Dict
    item_features: Dict
    context_features: Dict
    timestamp: int

class StreamingEngine:
    """
    Monolith-style streaming engine using Redis + asyncio
    (Flink replacement for our scale)
    """
    
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self.feature_ttl = 7 * 24 * 3600  # 7 days
    
    async def log_action(self, action: UserAction):
        """Log user action to action stream"""
        await self.redis.xadd("actions", action.__dict__)
        # Also store in feature cache for joining
        await self.redis.hset(
            f"features:{action.request_id}", 
            mapping={"action": json.dumps(action.__dict__)},
            ex=self.feature_ttl
        )
    
    async def log_features(self, features: FeatureVector):
        """Log features to feature stream"""
        await self.redis.xadd("features", features.__dict__)
        await self.redis.hset(
            f"features:{features.request_id}",
            mapping={"features": json.dumps(features.__dict__)},
            ex=self.feature_ttl
        )
    
    async def join_and_train(self, batch_size: int = 1000) -> List[Dict]:
        """
        Online joiner: match actions with features by request_id
        Produce training examples for online trainer
        """
        # Read pending actions
        actions = await self.redis.xread({"actions": "0"}, count=batch_size)
        training_examples = []
        
        for stream, messages in actions:
            for msg_id, data in messages:
                request_id = data.get("request_id")
                if not request_id:
                    continue
                
                # Try to get features
                feature_data = await self.redis.hget(
                    f"features:{request_id}", "features"
                )
                
                if feature_data:
                    # Join successful - create training example
                    example = {
                        "action": data,
                        "features": json.loads(feature_data),
                        "label": self._action_to_label(data.get("action_type"))
                    }
                    training_examples.append(example)
                    
                    # Clean up
                    await self.redis.delete(f"features:{request_id}")
        
        # Push to training queue
        if training_examples:
            await self.redis.xadd("training_examples", 
                {"examples": json.dumps(training_examples)})
        
        return training_examples
    
    def _action_to_label(self, action_type: str) -> float:
        weights = {"click": 1.0, "like": 2.0, "save": 3.0, "share": 4.0}
        return weights.get(action_type, 0.0)
```

---

### Phase 3: Online Trainer + Parameter Sync (Week 3-4)

```python
# lib/realtime/online_trainer.py
import asyncio
import numpy as np
from typing import List
import torch
import torch.nn as nn

class OnlineTrainer:
    """
    Monolith online training: SGD on streaming examples
    Syncs to serving layer every minute
    """
    
    def __init__(self, embedding_table, model: nn.Module, sync_interval: int = 60):
        self.embedding_table = embedding_table
        self.model = model
        self.sync_interval = sync_interval
        self.optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        self.running = False
    
    async def train_step(self, examples: List[Dict]):
        """Single SGD step on batch of examples"""
        if not examples:
            return
        
        # Extract embeddings for user/item IDs
        user_ids = [e["action"]["user_id"] for e in examples]
        item_ids = [e["action"]["item_id"] for e in examples]
        
        # Get current embeddings (collisionless lookup)
        user_embs = await asyncio.gather(*[
            self.embedding_table.get(uid) for uid in user_ids
        ])
        item_embs = await asyncio.gather(*[
            self.embedding_table.get(iid) for iid in item_ids
        ])
        
        # Forward pass
        labels = torch.tensor([e["label"] for e in examples], dtype=torch.float)
        
        # Compute loss, backward, update embeddings via gradient
        loss = self._compute_loss(user_embs, item_embs, labels)
        loss.backward()
        
        # Update embeddings in Cuckoo table with gradients
        await self._update_embeddings_with_gradients(
            user_ids, item_ids, user_embs, item_embs
        )
        
        self.optimizer.step()
        self.optimizer.zero_grad()
    
    async def sync_to_serving(self):
        """Push updated embeddings to serving layer (vLLM + UCOL)"""
        # Monolith: sync sparse params every minute, dense daily
        # We sync Cuckoo table changes to Supabase + invalidate Lattice-1 cache
        await self.embedding_table.flush_dirty()
        
        # Notify serving layer (Redis pub/sub or HTTP)
        await self.redis.publish("embedding_update", 
            json.dumps({"timestamp": time.time(), "type": "sparse"}))

    async def run(self):
        self.running = True
        while self.running:
            # Read training examples from stream
            examples = await self.streaming_engine.join_and_train()
            if examples:
                await self.train_step(examples)
            
            # Periodic sync
            await asyncio.sleep(self.sync_interval)
            await self.sync_to_serving()
```

---

### Phase 4: Serving Integration (Week 4)

```python
# lib/realtime/serving.py
class RealTimeServingLayer:
    """
    Serving layer with real-time embedding updates
    Combines Lattice-1 + UCOL memory + Cuckoo embeddings
    """
    
    def __init__(self, lattice_client, embedding_table, redis):
        self.lattice = lattice_client
        self.embeddings = embedding_table
        self.redis = redis
        self._setup_update_listener()
    
    async def recommend(self, user_id: str, candidates: List[str], 
                       context: Dict = None) -> List[Tuple[str, float]]:
        """Real-time recommendation with live embeddings"""
        
        # Get user embedding (collisionless, always fresh)
        user_emb = await self.embeddings.get(f"user:{user_id}")
        if user_emb is None:
            user_emb = await self._cold_start_embedding(user_id)
        
        # Get item embeddings (batch lookup)
        item_embs = await asyncio.gather(*[
            self.embeddings.get(f"item:{cid}") for cid in candidates
        ])
        
        # Score with lightweight model (or Lattice-1 for complex reasoning)
        scores = self._score_candidates(user_emb, item_embs, context)
        
        # Re-rank with UCOL/Lattice for top-K
        top_k = sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)[:20]
        reranked = await self._lattice_rerank(user_id, top_k, context)
        
        return reranked
    
    async def _lattice_rerank(self, user_id: str, candidates: List, context: Dict):
        """Use Lattice-1 + UCOL for final ranking"""
        prompt = self._build_rerank_prompt(user_id, candidates, context)
        response = await self.lattice.chat_completion(prompt)
        # Parse and re-order
        return self._parse_rerank(response, candidates)
```

---

## Lattice-Specific Adaptations

### 1. **UCOL Memory as "Dense Parameters"**
- Update UCOL procedural memory **daily** (like Monolith's dense params)
- Sync via existing `lattice-memory-sync` cron (already runs every 30 min)

### 2. **Lattice-1 as "Complex Ranking Model"**
- Use for final re-ranking of top-K candidates
- Lightweight scoring (dot product) for candidate generation

### 3. **Bluesky Agent as "User Action Source"**
- Every Bluesky engagement = implicit feedback signal
- Feed into streaming engine as `action_type: "bluesky_engage"`

### 4. **Hermes Delegation as "Training Workers"**
- Spawn sub-agents for parallel gradient computation
- Use `delegate_task` with `toolsets: ["terminal", "file"]`

---

## Implementation Priority

| Priority | Component | Effort | Value |
|----------|-----------|--------|-------|
| 1 | Cuckoo Embedding Table (Postgres + Redis) | 3 days | Eliminates collisions, enables growth |
| 2 | Streaming Engine (Redis Streams + Joiner) | 2 days | Real-time feedback loop |
| 3 | Online Trainer (SGD + minute sync) | 3 days | Continuous learning |
| 4 | Serving Integration (Lattice-1 + UCOL) | 2 days | Production recommendations |
| 5 | Bluesky Action Pipeline | 1 day | Dogfood on our own agent |

**Total: ~11 days to production real-time recs**

---

## Monitoring & Metrics (Monolith-Style)

```python
# lib/realtime/metrics.py
METRICS = {
    # Model quality
    "online_auc": "Track AUC hourly on holdout stream",
    "batch_vs_online_auc": "Compare like Monolith Figure 9",
    
    # System health  
    "embedding_collision_rate": "Should be 0 with Cuckoo",
    "stale_embedding_ratio": "Embeddings > TTL without access",
    "sync_latency_p99": "Parameter sync to serving < 1s",
    "ps_failure_recovery": "Model quality after shard loss",
    
    # Business
    "recommendation_ctr": "Click-through on served recs",
    "pattern_reuse_rate": "UCOL patterns applied to new users",
    "concept_drift_detection": "AUC drop > 5% triggers alert"
}
```

---

## Start This Week

```bash
# 1. Add Cuckoo embedding table to Supabase
# 2. Set up Redis streams for action/feature logs
# 3. Build online joiner (asyncio + Redis)
# 4. Wire Bluesky agent → action stream
# 5. Test minute-level sync with Lattice-1
```

Would you like me to start implementing any specific component?