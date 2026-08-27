# From JEPA to VJEPA: What We Actually Built

**Subtitle:** Uncertainty-aware prediction on the Vercel edge, with fail-closed guarantees and live staging validation.

---

## TL;DR

- Replaced full covariance with sparse diagonal variance to fit V8/Vercel limits.
- Added a fail-closed circuit breaker so uncertain predictions never randomize behavior.
- Shipped a dual-output ONNX predictor and validated it on real staging.
- Wired DP-SGD variance spikes to GossipSub heartbeat adaptation.

---

## 1. The Problem

We wanted the runtime to look ahead before emitting code. Joint Embedding Predictive Architectures (JEPA) give you a learned latent predictor, but the naive version makes two bad assumptions for production:

1. Full covariance is fine.  
2. Uncertainty can be smoothed over.

Both break under serverless constraints.

---

## 2. Why VJEPA, Not JEPA

VJEPA replaces the deterministic predictor with a diagonal Gaussian: `mu + log_var`. That gives you per-dimension uncertainty for free, without the memory cost of a full `128x128` covariance matrix.

On the Vercel edge, that distinction is existential: full covariance is ~16 KB per request, which fragments V8 heap and risks OOM at `numThreads=1`. Diagonal variance with sparse top-k selection gives you the same signal at ~1.5 KB.

---

## 3. The Constraints That Shaped the Design

- **Latent space**: fixed at 128 dimensions. Any increase kills WASM warm-start time.
- **WASM payload**: response object must stay under 8 KB heap.
- **Vercel cold-start**: 15 ms target, 600 ms budget.
- **Determinism**: if the predictor is unavailable or uncertain, the fallback is deterministic syntactic planning. No randomization.

Every decision downstream respects these four constraints.

---

## 4. Engineering Decisions

### Sparse Diagonal Variance
- Export `mu` and `log_var` as dual outputs from ONNX.
- In the edge route, reconstruct only indices where `exp(log_var) > θ_v = 0.01`.
- Result: ~15–20 variance entries instead of 128.

### Fail-Closed Circuit Breaker
- Threshold: `τ_v = 0.95` on `maxVarianceDim`.
- If exceeded, `fallbackToSyntactic = true` and the variance term is zeroed, not randomized.
- Latency-gated: cold-start gets 3 s; warm-start gets 250 ms.

### Variance-Aware MCTS
- UCB1 score subtracts `λ * meanVariance`, with `λ = 0.5`.
- High-uncertainty branches are deprioritized without being discarded.

### Decentralized DP-SGD
- Last-iterate momentum EMA for adaptive clipping. No central coordinator, no extra privacy budget.
- FUR penalty prevents privacy-induced representation collapse.

### GossipSub Hardening
- Dynamic heartbeat: 500 ms on variance spike, 1500 ms normal.
- IDONTWANT filtering drops messages > 1 MB.
- Rate limiting: 10 IHAVE/IWANT per 60 s per peer.

---

## 5. Live Validation

Endpoint: `https://ai-saas-mt3ucolxk-invidias-codems-projects.vercel.app/api/jepa/predict`

| Metric | Target | Observed |
|--------|--------|----------|
| Warm-start latency | 15–20 ms | 167–264 ms |
| Cold-start latency | ≤ 600 ms | ~1.7 s first hit |
| Sparse payload size | ~1.5 KB | 5.4–5.6 KB |
| Circuit breaker | trip on `maxVar > 0.95` | ✅ Pass |
| Variance calibration | `maxVarianceDim = 0.964` at scale 0.1 | ✅ Pass |

The 167–264 ms warm-start is the realistic WASM floor on Vercel; the 1.7 s cold-start is amortized across requests. The payload sits at 5.6 KB because `mu` must remain mathematically dense. While the variance tensor can be safely sparsified to save space, pruning the `mu` tensor would destroy the isotropic geometry required for accurate cosine distance calculations in the MCTS loop. A 5.6 KB payload is an acceptable fixed cost to preserve mathematical correctness.

---

## 6. What We Would Do Differently

- Move the predictor to a long-lived edge runtime to eliminate cold-start entirely.
- Migrate the variance-spike trigger to a shared Upstash Redis bridge instead of relying on HTTP polling, dropping transport latency.

---

## 7. Takeaways

1. Diagonal variance is enough for uncertainty-aware planning. Full covariance is premature optimization on the edge.  
2. Fail-closed beats probabilistic fallback when determinism is a requirement.  
3. Staging validation under real Vercel constraints catches heap/latency issues that local tests miss.

---

## Links

- Integration story: `docs/reference/jepa-vjepa-integration.md`
- Live endpoint: `https://ai-saas-mt3ucolxk-invidias-codems-projects.vercel.app/api/jepa/predict`
