"""
Online Trainer + Minute-Level Parameter Sync for Lattice OS
Monolith-style continuous SGD on streaming examples
"""

import asyncio
import json
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Optional, Callable, Any
from datetime import datetime, timedelta
import redis.asyncio as redis
import logging

logger = logging.getLogger(__name__)


@dataclass
class TrainingConfig:
    """Configuration for online training"""
    learning_rate: float = 0.001
    batch_size: int = 256
    sync_interval_seconds: int = 60      # Minute-level sync (Monolith)
    max_queue_size: int = 10000
    gradient_clip_norm: float = 1.0
    weight_decay: float = 1e-5
    sparse_update_fraction: float = 0.1  # Fraction of embeddings updated per step


@dataclass
class TrainingStats:
    """Training statistics"""
    steps_completed: int = 0
    examples_processed: int = 0
    total_loss: float = 0.0
    avg_loss: float = 0.0
    last_sync: datetime = None
    sync_count: int = 0
    queue_lag: int = 0


class EmbeddingModel(nn.Module):
    """
    Lightweight embedding model for online training.
    In production: replace with actual Lattice-1 adapter or factorization machine.
    """
    
    def __init__(
        self,
        num_users: int,
        num_items: int,
        embedding_dim: int = 128,
        hidden_dims: List[int] = None,
    ):
        super().__init__()
        
        if hidden_dims is None:
            hidden_dims = [256, 128, 64]
        
        # Embedding layers (these get updated via SGD)
        self.user_embeddings = nn.Embedding(num_users, embedding_dim, sparse=True)
        self.item_embeddings = nn.Embedding(num_items, embedding_dim, sparse=True)
        
        # Dense layers (updated less frequently)
        layers = []
        input_dim = embedding_dim * 2  # user + item concat
        for hidden_dim in hidden_dims:
            layers.extend([
                nn.Linear(input_dim, hidden_dim),
                nn.ReLU(),
                nn.BatchNorm1d(hidden_dim),
                nn.Dropout(0.1),
            ])
            input_dim = hidden_dim
        layers.append(nn.Linear(input_dim, 1))  # Output: CTR/logit
        
        self.dense_net = nn.Sequential(*layers)
        
        # Initialize
        nn.init.xavier_uniform_(self.user_embeddings.weight)
        nn.init.xavier_uniform_(self.item_embeddings.weight)
    
    def forward(self, user_ids: torch.Tensor, item_ids: torch.Tensor) -> torch.Tensor:
        """Forward pass"""
        user_emb = self.user_embeddings(user_ids)
        item_emb = self.item_embeddings(item_ids)
        x = torch.cat([user_emb, item_emb], dim=1)
        return self.dense_net(x).squeeze(-1)
    
    def get_embeddings(self, user_ids: torch.Tensor = None, item_ids: torch.Tensor = None):
        """Get current embeddings for sync"""
        result = {}
        if user_ids is not None:
            result["user_embeddings"] = self.user_embeddings(user_ids).detach()
        if item_ids is not None:
            result["item_embeddings"] = self.item_embeddings(item_ids).detach()
        return result


class OnlineTrainer:
    """
    Monolith-style online trainer.
    
    Consumes training examples from streaming engine,
    runs SGD steps, syncs parameters to serving layer every minute.
    
    Key Monolith principles:
    - Sparse params (embeddings) synced every minute
    - Dense params synced daily
    - Fault-tolerant: lose 1 PS shard = negligible quality loss
    """
    
    def __init__(
        self,
        config: TrainingConfig,
        model: EmbeddingModel,
        streaming_engine: Any,  # StreamingEngine
        redis_client: redis.Redis,
        embedding_table: Any = None,  # CuckooEmbeddingTable
    ):
        self.config = config
        self.model = model
        self.streaming = streaming_engine
        self.redis = redis_client
        self.embedding_table = embedding_table
        
        # Optimizers: separate for sparse (embeddings) and dense
        self.sparse_optimizer = optim.SGD(
            [
                {"params": model.user_embeddings.parameters(), "lr": config.learning_rate},
                {"params": model.item_embeddings.parameters(), "lr": config.learning_rate},
            ],
            momentum=0.9,
            weight_decay=config.weight_decay,
        )
        
        self.dense_optimizer = optim.Adam(
            model.dense_net.parameters(),
            lr=config.learning_rate * 0.1,  # Slower for dense
            weight_decay=config.weight_decay,
        )
        
        self.criterion = nn.BCEWithLogitsLoss()
        
        # State
        self._running = False
        self._stats = TrainingStats()
        self._training_queue: asyncio.Queue = asyncio.Queue(maxsize=config.max_queue_size)
        self._last_dense_sync = datetime.utcnow()
        
        # Callbacks for parameter sync
        self._sync_callbacks: List[Callable] = []
    
    def register_sync_callback(self, callback: Callable):
        """Register callback for parameter sync to serving layer"""
        self._sync_callbacks.append(callback)
    
    async def start(self):
        """Start training loop"""
        self._running = True
        logger.info("Online trainer started")
        
        # Start background tasks
        asyncio.create_task(self._consumer_loop())
        asyncio.create_task(self._training_loop())
        asyncio.create_task(self._sync_loop())
        asyncio.create_task(self._stats_loop())
    
    async def stop(self):
        """Stop training"""
        self._running = False
        await self._flush_queue()
        logger.info("Online trainer stopped")
    
    # ==================== Consumer Loop ====================
    
    async def _consumer_loop(self):
        """Consume training examples from streaming engine"""
        while self._running:
            try:
                # Get batch from streaming engine
                examples = await self.streaming.consume_training_batch(
                    count=self.config.batch_size
                )
                
                for ex in examples:
                    # Add to training queue (backpressure handled by queue maxsize)
                    await self._training_queue.put(ex)
                    self._stats.examples_processed += 1
                    self._stats.queue_lag = self._training_queue.qsize()
                    
            except Exception as e:
                logger.error(f"Consumer error: {e}")
                await asyncio.sleep(1)
    
    # ==================== Training Loop ====================
    
    async def _training_loop(self):
        """Main SGD training loop"""
        batch = []
        
        while self._running:
            try:
                # Collect batch from queue
                batch = []
                while len(batch) < self.config.batch_size:
                    try:
                        ex = await asyncio.wait_for(
                            self._training_queue.get(), 
                            timeout=0.1
                        )
                        batch.append(ex)
                    except asyncio.TimeoutError:
                        break
                
                if not batch:
                    await asyncio.sleep(0.01)
                    continue
                
                # Run SGD step
                loss = await self._train_step(batch)
                
                self._stats.steps_completed += 1
                self._stats.total_loss += loss
                self._stats.avg_loss = self._stats.total_loss / self._stats.steps_completed
                
            except Exception as e:
                logger.error(f"Training step error: {e}")
                await asyncio.sleep(0.1)
    
    async def _train_step(self, examples: List[Any]) -> float:
        """Single SGD step on batch of examples"""
        if not examples:
            return 0.0
        
        # Convert to tensors
        user_ids = torch.tensor([self._hash_id(f"u:{ex.user_id}") for ex in examples], dtype=torch.long)
        item_ids = torch.tensor([self._hash_id(f"i:{ex.item_id}") for ex in examples], dtype=torch.long)
        labels = torch.tensor([ex.label for ex in examples], dtype=torch.float)
        
        # Forward pass
        self.model.train()
        logits = self.model(user_ids, item_ids)
        loss = self.criterion(logits, labels)
        
        # Backward
        self.sparse_optimizer.zero_grad()
        self.dense_optimizer.zero_grad()
        loss.backward()
        
        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(
            list(self.model.user_embeddings.parameters()) + 
            list(self.model.item_embeddings.parameters()),
            self.config.gradient_clip_norm
        )
        
        # Optimizer steps
        self.sparse_optimizer.step()
        self.dense_optimizer.step()
        
        # Update Cuckoo embedding table if available
        if self.embedding_table:
            await self._update_cuckoo_embeddings(user_ids, item_ids)
        
        return loss.item()
    
    def _hash_id(self, key: str) -> int:
        """Hash ID to embedding index"""
        import mmh3
        return mmh3.hash64(key, seed=123)[0] % 1_000_000
    
    async def _update_cuckoo_embeddings(self, user_ids: torch.Tensor, item_ids: torch.Tensor):
        """Sync embeddings to Cuckoo table"""
        if not self.embedding_table:
            return
            
        # Get updated embeddings
        user_embs = self.model.user_embeddings(user_ids).detach().cpu().numpy()
        item_embs = self.model.item_embeddings(item_ids).detach().cpu().numpy()
        
        # Batch update to Cuckoo table
        for uid, emb in zip(user_ids.cpu().numpy(), user_embs):
            await self.embedding_table.put(f"u:{uid}", emb)
        
        for iid, emb in zip(item_ids.cpu().numpy(), item_embs):
            await self.embedding_table.put(f"i:{iid}", emb)
    
    # ==================== Parameter Sync ====================
    
    async def _sync_loop(self):
        """Minute-level parameter sync to serving layer"""
        while self._running:
            await asyncio.sleep(self.config.sync_interval_seconds)
            await self._sync_sparse_params()
            
            # Daily dense sync
            if datetime.utcnow() - self._last_dense_sync > timedelta(days=1):
                await self._sync_dense_params()
                self._last_dense_sync = datetime.utcnow()
    
    async def _sync_sparse_params(self):
        """Sync sparse embeddings to serving layer (every minute)"""
        logger.debug("Syncing sparse parameters to serving layer...")
        
        try:
            # Get dirty keys from Cuckoo table
            if self.embedding_table:
                dirty_keys = self.embedding_table.get_dirty_keys()
                
                # Prepare sync payload
                sync_data = {
                    "type": "sparse",
                    "timestamp": datetime.utcnow().isoformat(),
                    "embeddings": {},
                    "dirty_keys": dirty_keys[:1000],  # Limit per sync
                }
                
                # Execute sync callbacks
                for callback in self._sync_callbacks:
                    try:
                        await callback(sync_data)
                    except Exception as e:
                        logger.error(f"Sync callback failed: {e}")
            
            self._stats.sync_count += 1
            self._stats.last_sync = datetime.utcnow()
            
            # Notify serving layer via Redis
            await self.redis.publish(
                "lattice:param_sync",
                json.dumps({
                    "type": "sparse",
                    "timestamp": datetime.utcnow().timestamp(),
                    "count": len(dirty_keys) if self.embedding_table else 0,
                })
            )
            
        except Exception as e:
            logger.error(f"Sparse sync failed: {e}")
    
    async def _sync_dense_params(self):
        """Sync dense model parameters (daily)"""
        logger.info("Syncing dense parameters...")
        
        try:
            sync_data = {
                "type": "dense",
                "timestamp": datetime.utcnow().isoformat(),
                "model_state": {
                    k: v.cpu().tolist() 
                    for k, v in self.model.dense_net.state_dict().items()
                },
            }
            
            for callback in self._sync_callbacks:
                try:
                    await callback(sync_data)
                except Exception as e:
                    logger.error(f"Dense sync callback failed: {e}")
                    
        except Exception as e:
            logger.error(f"Dense sync failed: {e}")
    
    # ==================== Queue Management ====================
    
    async def _flush_queue(self):
        """Process remaining queue items on shutdown"""
        while not self._training_queue.empty():
            try:
                batch = []
                while len(batch) < self.config.batch_size and not self._training_queue.empty():
                    batch.append(await self._training_queue.get())
                
                if batch:
                    await self._train_step(batch)
            except Exception as e:
                logger.error(f"Queue flush error: {e}")
    
    # ==================== Stats ====================
    
    async def _stats_loop(self):
        """Periodic stats logging"""
        while self._running:
            await asyncio.sleep(60)
            logger.info(
                f"Training stats: steps={self._stats.steps_completed}, "
                f"examples={self._stats.examples_processed}, "
                f"avg_loss={self._stats.avg_loss:.4f}, "
                f"queue_lag={self._stats.queue_lag}, "
                f"syncs={self._stats.sync_count}"
            )
    
    def get_stats(self) -> Dict:
        return {
            "steps": self._stats.steps_completed,
            "examples": self._stats.examples_processed,
            "avg_loss": self._stats.avg_loss,
            "queue_lag": self._stats.queue_lag,
            "sync_count": self._stats.sync_count,
            "last_sync": self._stats.last_sync.isoformat() if self._stats.last_sync else None,
        }


# ==================== Sync Callbacks ====================

class ServingSyncCallbacks:
    """Callbacks for syncing parameters to vLLM/serving layer"""
    
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
    
    async def sparse_sync(self, sync_data: Dict):
        """Sync sparse embeddings to Redis cache for serving"""
        # Store in Redis for fast serving access
        for key, embedding in sync_data.get("embeddings", {}).items():
            await self.redis.set(
                f"lattice:serving:emb:{key}",
                json.dumps(embedding.tolist() if hasattr(embedding, 'tolist') else embedding),
                ex=3600  # 1h TTL
            )
        
        # Set sync timestamp
        await self.redis.set(
            "lattice:serving:last_sparse_sync",
            sync_data.get("timestamp", datetime.utcnow().isoformat()),
        )
    
    async def dense_sync(self, sync_data: Dict):
        """Sync dense model to Redis"""
        await self.redis.set(
            "lattice:serving:dense_state",
            json.dumps(sync_data.get("model_state", {})),
            ex=86400 * 2  # 2 days
        )
        
        await self.redis.set(
            "lattice:serving:last_dense_sync",
            sync_data.get("timestamp", datetime.utcnow().isoformat()),
        )


# ==================== Factory ====================

async def create_online_trainer(
    config: TrainingConfig,
    model: EmbeddingModel,
    streaming_engine: Any,
    redis_client: redis.Redis,
    embedding_table: Any = None,
) -> OnlineTrainer:
    """Create and configure online trainer with sync callbacks"""
    
    trainer = OnlineTrainer(
        config=config,
        model=model,
        streaming_engine=streaming_engine,
        redis_client=redis_client,
        embedding_table=embedding_table,
    )
    
    # Register sync callbacks
    sync_callbacks = ServingSyncCallbacks(redis_client)
    trainer.register_sync_callback(sync_callbacks.sparse_sync)
    trainer.register_sync_callback(sync_callbacks.dense_sync)
    
    return trainer