# research(jepa): real-model shadow probe with latency circuit breaker

**Status:** Open. Predecessor capability probe PASSED, banking as capability-only, not readiness.
**Triggered by:** Dummy-model probe at 598 ms / 600 ms cold-start threshold and prior recorded 1.7–4.8 s real-model cold-start.

## Goal

Establish the **real latency distribution** of the JEPA stack inside the Vercel preview environment, broken down by stage, so the architecture choice between (A) warm/background execution, (B) client/local WASM execution, or (C) durable async inference is evidence-based instead of assumed.

This slice is **not** about optimizing against the 600 ms budget. That comes later. This slice's job is to find where the time actually goes.

## Boundary

- Completely outside the normal Lattice request path. No calls from routing, conversation, code-builder, weaver, or any production surface.
- Gated by `ENABLE_JEPA=true` on Preview only.
- New route `app/api/jepa/shadow-probe/route.ts`.
- Existing `/api/wasm-probe`, `/api/jepa/{infer,predict,reflect,p2p}` are not modified.
- No JEPA-flag touched in Production. Production unchanged end-to-end.

## What varies from the capability probe

| Axis | Capability probe (done) | Shadow probe (this slice) |
|---|---|---|
| Model | `dummy_fp32.onnx` (78 bytes, identity) | `public/wasm/predictor.onnx` + `public/wasm/reflection_expert.onnx` |
| Question | "does ONNX/WASM load at all?" | "where does real-model time go?" |
| Output | one coarse `totalMs` | per-stage timings + circuit-breaker verdict |
| Failure surface | catch-all `error.message` | typed `reason` enum |
| Circuit breaker | none | yes, fail-closed |

## Instrumentation breakdown (each its own measurement)

1. **model_fetch_ms** — read / fetch of the `.onnx` artifact into memory. For the heavy variant, fetched from `https://<preview>/wasm/predictor.onnx` (realistic CDN path); baseline also measured against `fs.readFileSync` of the local path so we can separate network from disk.
2. **wasm_init_ms** — `onnxruntime-web` WASM runtime init (`ort.env.wasm` config applied, runtime loaded). Distinct from session creation.
3. **session_init_ms** — `InferenceSession.create(model, { executionProviders: ['wasm'], wasmPaths: ... })`.
4. **preprocess_ms** — token → tensor assembly, dummy or real, but use the same dtype/shape as the production predictor head so the number means something.
5. **predictor_inference_ms** — `session.run()` on the predictor model alone.
6. **reflection_inference_ms** — `session.run()` on the reflection_expert model alone. Skipped on cold start if circuit breaker already tripped at predictor stage.
7. **postprocess_ms** — `Array.from(results.mu.data)`, sparse-variance emit per `serverless-ml-inference` VJEPA pattern.
8. **total_ms** — wall time inside the handler from request entry to serialization.

Per-run record also includes: `coldStart: <bool>` (first invocation in this lambda instance), `routeRegion`, `routeRuntime`, `runtimeVersion`, `modelBytes`, `wasmAssetBytes`.

## Circuit breaker (fail-closed, no timing games)

In-memory per-container breaker, modeled after `serverless-ml-inference` skill pattern.

- Budgets:
  - `warm_budget_ms = 600` (per the spec)
  - `cold_budget_ms = 5_000` (per observed reflection-expert cold 1.7–4.8 s range; we still want to *observe* not just trip instantly)
- Thresholds: 3 consecutive failures opens the circuit; 30 s cool-down to half-open; one failure from half-open re-opens. Latency over budget counts as a failure.
- `reason` enum is the contract — one of:
  - `cold_start_budget_exceeded`
  - `model_load_failed`
  - `session_init_failed`
  - `inference_budget_exceeded`
  - `memory_pressure`
  - `output_invalid`
- When open, return a typed 503 with `{ circuitState: 'open', reason, lastError? }` so callers know not to retry blindly.

Every invocation is logged with the same shape so the slice's after-action report can group by `coldStart`, `stage`, and `reason` without parsing free-text.

## Method (one bounded run)

1. Confirm `ENABLE_JEPA=false` on Preview (this slice's prerequisite).
2. Implement route + breaker + per-stage timing. No `pnpm add`. Use `onnxruntime-web` already in `package.json`.
3. `next build` locally to confirm no obvious compile issue; do not local-run the probe (network/CDN behavior differs meaningfully from Vercel).
4. Deploy preview; verify env read; then run **6 probes** spaced to capture both cold and warm behavior:
   - 1× cold (fresh deployment, first hit)
   - 5× warm (2 s apart)
5. Capture bundle size of new route via `vercel inspect`.
6. Report.

Optional second pass, same slice: bump `cold_budget_ms` to ∞ for one extra cold run to see the *unbounded* cold-start distribution of the reflection expert. That's only worth doing if the bounded cold run already exceeded 5 s.

## Acceptance criteria

A report exists (in this chat, then committed as `research/world-model/jepa-real-model-probe-report.md`) with:

- Per-stage ms for cold and warm, broken out per the 8 buckets above.
- Bundle size of the new route.
- Circuit state transitions observed (if any).
- Final verdict: does the real model fit sync-serverless? If not, which architecture (A/B/C) does the timing data point to?
- All errors carry `reason` from the enum, not ad-hoc strings.

## Out of scope

- Optimizing past the 600 ms budget
- Production traffic
- Changing routing, MCTS, or any Decision Plane wiring
- Touching `predictor.onnx` / `reflection_expert.onnx` weights themselves
- Refactoring existing `/api/jepa/*` routes

## Kill conditions for the slice

- Any observed cross-route impact (other endpoints' latency or errors change while probing)
- Bundle size contribution pushes any single route past 150 MB
- Memory pressure that crashes the container
- Nondeterministic output *content* (not latency) across identical warm inputs

Any of those = stop, kill the flag, write up what we learned instead of pushing forward.

## After this slice

Decision which of (A) warm/background, (B) client/local WASM, (C) durable async inference is the right lane for the actual JEPA production work. That decision is its own slice; this one only produces the data.
