"""
Streaming Engine + Online Joiner for Lattice OS
Monolith-style real-time feature joining using Redis Streams
"""

import asyncio
import json
import redis.asyncio as redis
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class UserAction:
    """User interaction event"""
    user_id: str
    item_id: str
    action_type: str          # click, like, save, share, dwell, purchase
    request_id: str          # Join key for feature matching
    timestamp: int           # Unix timestamp
    metadata: Dict = field(default_factory=dict)
    
    @property
    def label_weight(self) -> float:
        """Convert action to training label weight"""
        weights = {
            "impression": 0.1,
            "dwell": 0.5,
            "click": 1.0,
            "like": 2.0,
            "save": 3.0,
            "share": 4.0,
            "purchase": 10.0,
        }
        return weights.get(self.action_type, 0.0)


@dataclass
class FeatureVector:
    """Feature vector for a request/user/item"""
    request_id: str
    user_features: Dict = field(default_factory=dict)
    item_features: Dict = field(default_factory=dict)
    context_features: Dict = field(default_factory=dict)
    timestamp: int = 0
    
    def __post_init__(self):
        if self.timestamp == 0:
            self.timestamp = int(datetime.utcnow().timestamp())


@dataclass
class TrainingExample:
    """Joined action + features = training example"""
    request_id: str
    user_id: str
    item_id: str
    action_type: str
    label: float
    user_features: Dict
    item_features: Dict
    context_features: Dict
    timestamp: int


class StreamingEngine:
    """
    Monolith-style streaming engine using Redis Streams.
    Replaces Flink for our scale - asyncio + Redis Streams.
    
    Flow:
    1. User actions logged to "actions" stream
    2. Features logged to "features" stream  
    3. Online joiner matches by request_id
    4. Training examples pushed to "training_examples" stream
    5. Online trainer consumes training_examples
    """
    
    def __init__(
        self, 
        redis_url: str = "redis://localhost:6379",
        feature_ttl_seconds: int = 7 * 24 * 3600,  # 7 days
        batch_size: int = 1000,
    ):
        self.redis_url = redis_url
        self.feature_ttl = feature_ttl_seconds
        self.batch_size = batch_size
        self.redis: Optional[redis.Redis] = None
        self._running = False
        
        # Stream keys
        self.ACTIONS_STREAM = "lattice:actions"
        self.FEATURES_STREAM = "lattice:features"
        self.TRAINING_STREAM = "lattice:training_examples"
        self.FEATURE_CACHE_PREFIX = "lattice:feature_cache:"
    
    async def connect(self):
        """Initialize Redis connection"""
        self.redis = redis.from_url(self.redis_url, decode_responses=True)
        await self.redis.ping()
        logger.info("Streaming engine connected to Redis")
    
    async def close(self):
        if self.redis:
            await self.redis.close()
    
    # ==================== Ingestion ====================
    
    async def log_action(self, action: UserAction) -> str:
        """Log user action to stream"""
        data = asdict(action)
        # Redis streams need string values
        data = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) 
                for k, v in data.items()}
        
        msg_id = await self.redis.xadd(self.ACTIONS_STREAM, data)
        
        # Also cache for fast join lookup
        await self.redis.hset(
            f"{self.FEATURE_CACHE_PREFIX}{action.request_id}",
            mapping={"action": json.dumps(asdict(action))},
            ex=self.feature_ttl,
        )
        
        return msg_id
    
    async def log_features(self, features: FeatureVector) -> str:
        """Log features to stream"""
        data = asdict(features)
        data = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) 
                for k, v in data.items()}
        
        msg_id = await self.redis.xadd(self.FEATURES_STREAM, data)
        
        # Also cache for fast join lookup
        await self.redis.hset(
            f"{self.FEATURE_CACHE_PREFIX}{features.request_id}",
            mapping={"features": json.dumps(asdict(features))},
            ex=self.feature_ttl,
        )
        
        return msg_id
    
    # ==================== Online Joiner ====================
    
    async def join_and_produce(self, max_examples: int = None) -> List[TrainingExample]:
        """
        Core online joiner: match actions with features by request_id.
        Produces training examples for online trainer.
        """
        limit = max_examples or self.batch_size
        training_examples = []
        
        # Read pending actions from stream
        action_entries = await self.redis.xread(
            streams={self.ACTIONS_STREAM: "0"},
            count=limit,
            block=1000  # Wait up to 1s for new entries
        )
        
        if not action_entries:
            return training_examples
        
        for stream_name, messages in action_entries:
            for msg_id, data in messages:
                # Parse action
                action = self._parse_action(data)
                if not action:
                    continue
                
                request_id = action.request_id
                
                # Try to get features from cache
                feature_data = await self.redis.hget(
                    f"{self.FEATURE_CACHE_PREFIX}{request_id}", 
                    "features"
                )
                
                if feature_data:
                    # Join successful!
                    features = json.loads(feature_data)
                    
                    example = TrainingExample(
                        request_id=request_id,
                        user_id=action.user_id,
                        item_id=action.item_id,
                        action_type=action.action_type,
                        label=action.label_weight,
                        user_features=features.get("user_features", {}),
                        item_features=features.get("item_features", {}),
                        context_features=features.get("context_features", {}),
                        timestamp=action.timestamp,
                    )
                    training_examples.append(example)
                    
                    # Clean up cache
                    await self.redis.delete(
                        f"{self.FEATURE_CACHE_PREFIX}{request_id}"
                    )
                    
                # Else: features not arrived yet - action stays in stream for next pass
        
        # Push training examples to stream
        if training_examples:
            await self._push_training_examples(training_examples)
        
        return training_examples
    
    async def _push_training_examples(self, examples: List[TrainingExample]):
        """Batch push training examples to stream"""
        for ex in examples:
            data = {
                "request_id": ex.request_id,
                "user_id": ex.user_id,
                "item_id": ex.item_id,
                "action_type": ex.action_type,
                "label": str(ex.label),
                "user_features": json.dumps(ex.user_features),
                "item_features": json.dumps(ex.item_features),
                "context_features": json.dumps(ex.context_features),
                "timestamp": str(ex.timestamp),
            }
            await self.redis.xadd(self.TRAINING_STREAM, data)
    
    # ==================== Training Consumer ====================
    
    async def consume_training_batch(self, count: int = None) -> List[TrainingExample]:
        """Consumer for online trainer - read training examples"""
        limit = count or self.batch_size
        
        entries = await self.redis.xread(
            streams={self.TRAINING_STREAM: "0"},
            count=limit,
            block=5000
        )
        
        examples = []
        if entries:
            for stream_name, messages in entries:
                for msg_id, data in messages:
                    try:
                        ex = TrainingExample(
                            request_id=data["request_id"],
                            user_id=data["user_id"],
                            item_id=data["item_id"],
                            action_type=data["action_type"],
                            label=float(data["label"]),
                            user_features=json.loads(data["user_features"]),
                            item_features=json.loads(data["item_features"]),
                            context_features=json.loads(data["context_features"]),
                            timestamp=int(data["timestamp"]),
                        )
                        examples.append(ex)
                    except Exception as e:
                        logger.error(f"Failed to parse training example: {e}")
        
        return examples
    
    # ==================== Helpers ====================
    
    def _parse_action(self, data: Dict) -> Optional[UserAction]:
        """Parse action from stream data"""
        try:
            return UserAction(
                user_id=data.get("user_id", ""),
                item_id=data.get("item_id", ""),
                action_type=data.get("action_type", ""),
                request_id=data.get("request_id", ""),
                timestamp=int(data.get("timestamp", 0)),
                metadata=json.loads(data["metadata"]) if isinstance(data.get("metadata"), str) else data.get("metadata", {}),
            )
        except Exception as e:
            logger.error(f"Failed to parse action: {e}")
            return None
    
    # ==================== Stats ====================
    
    async def get_stream_stats(self) -> Dict:
        """Get stream lengths and lag"""
        stats = {}
        for stream in [self.ACTIONS_STREAM, self.FEATURES_STREAM, self.TRAINING_STREAM]:
            length = await self.redis.xlen(stream)
            stats[stream] = length
        return stats


# ==================== Integration Helpers ====================

class BlueskyActionLogger:
    """Bridge Bluesky agent actions to streaming engine"""
    
    def __init__(self, streaming_engine: StreamingEngine):
        self.engine = streaming_engine
    
    async def log_engagement(
        self,
        user_did: str,
        target_uri: str,
        engagement_type: str,  # like, repost, reply, follow
        request_id: str = None,
    ):
        """Log Bluesky engagement as user action"""
        import uuid
        request_id = request_id or str(uuid.uuid4())
        
        action = UserAction(
            user_id=f"bluesky:{user_did}",
            item_id=target_uri,
            action_type=engagement_type,
            request_id=request_id,
            timestamp=int(datetime.utcnow().timestamp()),
            metadata={"source": "bluesky_agent"},
        )
        
        await self.engine.log_action(action)
        return request_id
    
    async def log_impression(
        self,
        user_did: str,
        feed_items: List[str],
        request_id: str = None,
    ):
        """Log feed impressions for ranking feedback"""
        import uuid
        request_id = request_id or str(uuid.uuid4())
        
        # Log each impression
        for item_uri in feed_items:
            action = UserAction(
                user_id=f"bluesky:{user_did}",
                item_id=item_uri,
                action_type="impression",
                request_id=f"{request_id}:{item_uri}",
                timestamp=int(datetime.utcnow().timestamp()),
                metadata={"source": "bluesky_feed", "batch_id": request_id},
            )
            await self.engine.log_action(action)
        
        return request_id


# ==================== Factory ====================

async def create_streaming_engine(
    redis_url: str = "redis://localhost:6379",
) -> StreamingEngine:
    """Create and connect streaming engine"""
    engine = StreamingEngine(redis_url)
    await engine.connect()
    return engine