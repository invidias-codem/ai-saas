# JEPA Local: P2P Gossip Learning Primitives

Local node-level scaffolding for decentralized Joint-Embedding Predictive
Architecture (JEPA) training with representation-collapse safeguards and
Byzantine-resilient gossip aggregation.

## Architecture

```
LocalJEPANode
    ├── JEPAEncoder             # local source encoder
    ├── TargetEncoder (EMA)     # slowly-updated target encoder
    ├── JEPAPredictor           # predicts target from source
    └── JEPALocalLoss
            ├── L_JEPA          # MSE prediction loss
            └── L_FUR           # Flexible Uniform Regularizer (kernel MMD)

AsynchronousEnsembleAggregator
    ├── ingest_peer_model()     # non-blocking gossip buffer
    └── execute_aggregation()
            ├── divergence pruning
            ├── trimmed mean
            └── local model update + EMA sync

GossipTransportEngine
    ├── _message_handler()      # deserialize → ingest_peer_model()
    ├── broadcast_local_model() # serialize → publish
    └── periodic_aggregation_loop()
```

## File Layout

```
jepa-local/
├── README.md
├── config.py                  # JEPAConfig dataclass
├── losses/
│   └── jepa_loss.py           # encoder, predictor, FUR, local node, divergence utils
├── aggregation/
│   ├── aea_engine.py          # AEA: non-blocking buffer, trimmed mean, divergence pruning
│   └── divergence.py          # geometric median, cosine divergence, staleness weights
├── network/
│   └── gossip_transport.py    # abstract libp2p/Gossipsub transport scaffold
└── tests/
    └── test_local_jepa.py     # verification suite
```

## Key Invariants

1. **FUR before gossip**: embeddings are regularized to be isotropic locally
2. **Non-blocking ingestion**: training never waits for network
3. **Divergence-aware**: peers with high angular divergence are excluded
4. **Byzantine-resilient**: trimmed mean + geometric median reject outliers
5. **EMA target sync**: target encoder tracks source encoder after each aggregation

## Usage

```python
from config import JEPAConfig
from losses.jepa_loss import LocalJEPANode
from aggregation.aea_engine import AsynchronousEnsembleAggregator

cfg = JEPAConfig(embedding_dim=256, hidden_dim=512)
local = LocalJEPANode(cfg)
aea = AsynchronousEnsembleAggregator(local, cfg)

# Train locally
loss, components = local(x_view, x_target)
loss.backward()
torch.nn.utils.clip_grad_norm_(local.encoder.parameters(), cfg.max_grad_norm)
optimizer.step()
local.update_target_encoder()

# When peers gossip in (from network handler)
aea.ingest_peer_model(peer_weights, metadata)

# At epoch end
report = aea.execute_aggregation()
```

## Verification

```bash
PYTHONPATH=research/world-model/jepa-local python -W ignore research/world-model/jepa-local/tests/test_local_jepa.py
```

All 8 tests pass:
- FUR penalizes collapsed embeddings correctly
- FUR near-zero for matching prior
- Loss components finite
- Gradients flow through FUR
- Training step stable
- Divergence utils correct
- Staleness weights decay
- Geometric median robust to outliers
