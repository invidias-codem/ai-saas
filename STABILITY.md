# STABILITY.md — Lattice OS JEPA P2P Mesh

**Status:** Frozen architectural contract  
**Applies to:** `research/world-model/jepa-local/`, `lib/jepa/`, `workers/jepa-p2p-worker.ts`  
**Audience:** Contributors modifying training, transport, aggregation, or serialization

---

## 1. Purpose

This file documents the invariants, pure functions, service contracts, and load-bearing schema of the decentralized JEPA flywheel. The TypeScript edge runtime and the Python daemon share memory only through well-defined boundaries. Violating any contract below can silently corrupt model state, break Byzantine-resilience, or tear serialized state dicts.

**Rule:** If a change touches any item in this document, it must be reviewed as a breaking change.

---

## 2. Invariants

- **Single shared model owner:** `MainWorker` is the only process allowed to instantiate and mutate `LocalJEPANode`. Telemetry, AEA, and gossip drain all operate on the same in-memory instance.
- **Target encoder EMA invariant:** After every `optimizer.step()` and after every AEA `load_state()`, `update_target_encoder()` must run. The target encoder is always an EMA of the source encoder with `tau = JEPAConfig.ema_tau`.
- **Embedding dim source of truth:** `JEPAConfig.embedding_dim` is the single source of truth for tensor shapes across encoder, predictor, FUR prior, telemetry decoding, and gossip serialization. Changing this without updating all consumers causes shape mismatches.
- **Append-only AEA buffer:** `AsynchronousEnsembleAggregator.peer_buffer` is append-only during ingestion and cleared only inside `execute_aggregation()`. Mixing these paths double-counts or drops updates.
- **Gossip JSONL atomicity:** `MainWorker.drain_gossip_queue()` must parse before truncating the queue file. Truncating first drops peer payloads on parse failure.
- **Processed-after-success:** `TelemetryConsumer` marks Supabase events `processed=True` only after `optimizer.step()` succeeds. Otherwise duplicate gradient work occurs.

---

## 3. Pure Functions

These functions are deterministic and side-effect-free. They are safe to refactor, inline, or reimplement as long as input/output shapes and semantics are preserved.

- `FlexibleUniformRegularizer.forward()` — given fixed `prior_samples` and `bandwidth` buffers
- `compute_representation_divergence()`
- `cosine_distance_matrix()`
- `staleness_weight()`
- `geometric_median_aggregate()`
- `divergence_weighted_average()`
- `degenerateVjepaDistribution()`
- `sampleFromVjepa()`
- `vjepaLogLikelihood()`
- `TelemetryConsumer._decode_tensor()`

---

## 4. Service Contracts

### 4.1 AEA Ingest — non-blocking

```python
aea.ingest_peer_model(peer_weights: Dict[str, torch.Tensor], metadata: dict) -> None
```

- Must never block. Call from network receive handlers only.
- Must not mutate `peer_weights` after append.
- Expected `metadata` keys: `accuracy`, `dataset_size`, `timestamp`, `divergence` (optional).

### 4.2 Gossip Message Handler — enqueue only

```typescript
pubsub.addEventListener('gossipsub:message', handleMessage)
```

- Deserializes payload, calls `bridge.enqueue(payload)` or equivalent.
- Must not call training or aggregation directly.
- Must catch and log deserialization failures; never throw into pubsub.

### 4.3 Broadcast — torn state prevention

```typescript
await pubsub.publish(topic, serialize(current_state_dict()))
```

- Must serialize the exact current weights. If reads can overlap with writes, add a lock or copy-on-read.
- Payload size must fit within Gossipsub limits; large tensors should be chunked or compressed before this boundary.

### 4.4 Telemetry — processed-after-success

```python
consumer.process_batch() -> int
```

- Returns number of events processed.
- Marks events processed only after `optimizer.step()` and `model.update_target_encoder()` succeed.
- Batch tensor projection/truncation to `JEPAConfig.embedding_dim` must happen here, not upstream.

### 4.5 Queue Drain — parse then truncate

```python
MainWorker.drain_gossip_queue() -> int
```

- Read file, parse JSONL, then truncate.
- On parse failure, log the bad payload and continue; do not abort the whole drain.

---

## 5. Load-Bearing Schema

### 5.1 GossipPayload (wire format)

```json
{
  "weights": {
    "encoder": {"shape": [D], "data": [float, ...]},
    "predictor": {"shape": [K], "data": [float, ...]},
    "target_encoder": {"shape": [D], "data": [float, ...]}
  },
  "metadata": {
    "accuracy": 0.95,
    "dataset_size": 1000,
    "timestamp": 1714000000.0,
    "peerId": "12D3KooW...",
    "modelGeneration": 1714000001,
    "divergence": 0.42
  }
}
```

- **Contract:** `weights` keys must be exactly `encoder`, `predictor`, `target_encoder`.
- **Contract:** Tensor sub-objects must include `shape` and `data`.
- **Stable since:** initial P2P scaffold.

### 5.2 GossipMetadata (TypeScript type)

```typescript
interface GossipMetadata {
  accuracy: number;
  dataset_size: number;
  timestamp: number;
  peerId: string;
  modelGeneration: number;
  divergence?: number;
}
```

- Changing field names or types breaks both serialization and AEA peer weighting.

### 5.3 Supabase DivergenceEvent

Table: `divergence_events`

| Column | Type | Contract |
|--------|------|----------|
| `id` | uuid / string | Primary key; used in `mark_events_processed()` |
| `detail` | jsonb | Must contain `s_x`, `action`, `s_y`, each as `{"shape": [D], "data": [float, ...]}` |
| `processed` | boolean | `False` → unprocessed; `True` → skip |
| `created_at` | timestamp | Ordering for batch fetch |

### 5.4 LocalJEPANode State Dict

```python
{
  "encoder": state_dict(),
  "predictor": state_dict(),
  "target_encoder": state_dict()
}
```

- `get_state_dict()` and `load_state()` must preserve this exact nesting.
- AEA consensus weights, gossip broadcast, and validation harness all key off this contract.

### 5.5 AEA Report Keys

```python
{
  "peers_ingested": float,
  "peers_aggregated": float,
  "peers_divergent": float,
  "mean_weight": float
}
```

- These keys are the only stable output surface of `execute_aggregation()`.
- Monitoring, validation harness, and main worker log parsing depend on exact names.

### 5.6 JEPAConfig Defaults

| Field | Default | Contract |
|-------|---------|----------|
| `embedding_dim` | `256` | All tensor shapes, FUR prior, telemetry projection |
| `hidden_dim` | `512` | Encoder/predictor hidden width |
| `predictor_depth` | `4` | Number of layers in predictor |
| `ema_tau` | `0.996` | Target encoder EMA decay |
| `jepa_weight` | `1.0` | L_JEPA coefficient |
| `fur_weight` | `0.1` | L_FUR coefficient |
| `predictor_weight` | `0.01` | L_predictor coefficient |
| `max_grad_norm` | `1.0` | Gradient clipping norm |

- Changing defaults requires updating all tests, configs, and telemetry batch assumptions.

### 5.7 P2PNodeConfig (TypeScript)

```typescript
interface P2PNodeConfig {
  listenAddrs: string[];
  bootstrappers: string[];
  privateKey?: string;
  topicName: string;
  onAggregationJob?: (job: AggregationJob) => void;
}
```

- All fields except `privateKey` are required at instantiation.

---

## 6. Change Protocol

1. **Identify contract:** Determine which section(s) above the change touches.
2. **Bump version:** If the change is breaking, increment the mesh protocol version in `topicName` (e.g., `lattice/jepa/v2`).
3. **Migrate all consumers:** Update Python and TypeScript together in the same PR.
4. **Run full validation:**
   - `python -m tests.test_local_jepa`
   - `python research/world-model/jepa-local/p2p/validation/mesh_validation_harness.py`
   - `pnpm exec tsc --noEmit -p tsconfig.json` scoped to `lib/jepa/**`
5. **Update this document:** Add a changelog entry at the bottom with date, author, and breaking fields.

---

## 7. libp2p Package Pinning

- `@chainsafe/libp2p-gossipsub` is pinned to `14.1.2`.
- `libp2p` is pinned to `3.3.9`.
- Gossipsub `scoreParams` keys and `globalSignaturePolicy` behavior are version-sensitive. Do not upgrade without reading the upstream changelog and validating `tsc` against the new types.

---

## 8. Changelog

- **2026-08-25** — Initial STABILITY.md frozen after Byzantine-resilience validation harness passed (`peers_divergent = 1`, `peers_aggregated = 0`).
