# JEPA → VJEPA Integration Story

## Context

We integrated a Joint Embedding Predictive Architecture into Lattice OS to give the
runtime a learned, uncertainty-aware lookahead before emitting code. This doc tracks
the milestones, architectural decisions, and live-validation results.

## Phase 1 — Spec & Architectural Dissection

- **Artifact**: `research/world-model/jepa-integration-spec.md`
- **Decision**: JEPA is advisory, not an authorization gate, unless explicitly gated
  by policy. Determinism is preserved through fail-closed semantics.
- **Edge cases addressed**:
  - Variance tensor integration into UCB1 scoring
  - Decentralized DP-SGD adaptive clipping without centralized coordination
  - WASM payload constraints for dual-tensor VJEPA output

## Phase 2 — Staged Implementation

| Stage | What | Outcome |
|-------|------|---------|
| A | VJEPA loss + DP-SGD engine in Python | Verified with local tests |
| B | Dual-output ONNX export (`mu`, `log_var`) | `public/wasm/predictor.onnx` written, INT8 quantized, ~720 KB |
| C | TS edge route: sparse Σ + circuit breaker | Deployed to Vercel staging |
| D | MCTS variance-aware UCB1 | `variancePenaltyLambda` propagated end-to-end |
| E | GossipSub v1.4 hardening | Dynamic heartbeat, IDONTWANT, rate limiting wired |

## Phase 3 — Live Staging Validation

Endpoint: `https://ai-saas-mt3ucolxk-invidias-codems-projects.vercel.app/api/jepa/predict`

| Metric | Target | Observed |
|--------|--------|----------|
| Warm-start latency | 15–20 ms | 167–264 ms |
| Cold-start latency | ≤ 600 ms | ~1.7 s first hit |
| Sparse payload size | ~1.5 KB | 5.4–5.6 KB |
| Circuit breaker | `fallbackToSyntactic=true` when `maxVar > τ_v=0.95` | ✅ Pass |
| Variance calibration | `maxVarianceDim=0.9640` at `x-jepa-variance-scale: 0.1` | ✅ Pass |

## Current Architecture

- **Python PM2 daemon**: owns Opacus DP-SGD engine, VJEPA ELBO loss, ONNX export
- **Next.js edge route**: owns sparse Σ reconstruction, τ_v circuit breaker
- **GossipSub transport**: polls `/api/jepa/p2p/state` for variance spike signals
- **Fail-closed**: variance term zeroed on failure, never randomized

## Next Steps

- Tighten payload via top-k sparsification of `mu`
- Promote validated preview to production
- Wire GossipSub variance spike bridge end-to-end in a long-lived Node process
