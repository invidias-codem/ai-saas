# JEPA real-model shadow probe — rerun report after predictor artifact repair

**Status:** bounded run completed. Both predictor and reflection legs measured end-to-end for the first time in this codebase.
**Parent spec:** `research/world-model/jepa-real-model-shadow-probe-spec.md`.
**Slice under test:** `b34fcea1` (PR #385) — split-copy predictor artifact restored to canonical 737,546-byte int8 export; size/meta integrity gate added.
**Rerun trigger:** throwaway branch `probe/rerun-b34fcea1` (PR #386) whose only tree change vs `b34fcea1` is this report file. Vercel Git Preview deployment `ai-saas-git-probe-rerun-b34fcea1-invidias-codems-projects.vercel.app`, region `iad1`.
**Flag lifecycle:** `ENABLE_JEPA=true` set on Preview only for the experiment; **re-disabled (`false`) immediately after harness completion.**

## Prior-run correction (must remain accurate)

The prior `91eee47e` experiment was invalidated on the full-stack axis by a split-copy `predictor.onnx` mismatch introduced in `b67ada56`. It failed during **predictor output validation** before the reflection leg was reached.

- `postprocess_ms` was absent on cold rows because predictor tensor shape did not match metadata.
- The reported `output_invalid` `lastReason` was the breaker's preserved first-failure reason from **predictor** postprocess, not an open-path mislabeling of a reflection-side error.
- The original report's wording that "the request failed in the reflection loader" was directionally consistent (the failing surface was at the loader/postprocess boundary) but the responsible artifact was the predictor's swapped binary, not the reflection ONNX.

The original report and its raw `jepa-real-model-probe-report.raw.jsonl` are preserved unchanged for historical evidence.

## Provenance

| Slot | File | trainingState | semanticValidity |
|---|---|---|---|
| predictor | `public/wasm/predictor.onnx` | `unknown_existing_artifact` | `unknown` |
| reflection | `public/wasm/reflection_expert_probe_untrained.onnx` | `untrained_probe_only` | **false** |

Size/hash check at runtime: `modelBytes=737,546` (predictor), `reflectModelBytes=1,191,449` (reflection). Both match the meta files enforced by `scripts/check-onnx-artifact-integrity.sh`.

## Method

- Harness: `scripts/jepa-real-model-probe.sh` shape, output redirected to `jepa-real-model-probe-report-rerun.raw.jsonl` (the original raw file is left alone per the supersede request).
- Route: `GET /api/jepa/shadow-probe` on the GitHub-triggered Vercel Preview.
- Sequence: 1 cold + 5 warm, 2 s apart, strict JSONL. No retry on circuit-open (none observed).
- **Pre-harness observation:** one warm-up probe was fired from the agent to confirm the route answered (`200` JSON) after the deployment became Ready. This consumed the truly-virgin cold run for that lambda instance. The first row labeled `cold` here is therefore the *first request* of the harness but the *second request* of the lambda; on this deployment it still reported `predictorCold:true, reflectionCold:true` because the warm-up and harness landed on different container instances. Recorded for transparency; not silently treated as a fresh cold.

## Measured timings (ms)

| Run | label | model_fetch | session_init | preprocess | predictor_inference | postprocess | reflect_model_fetch | reflect_session_init | reflection_inference | total (route) | wall (HTTP) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | cold   | 7 | 406 | 0 | 59 | 0 | 9  | 18 | 2 | **504** | 2,690 |
| 2 | warm-1 | – | –   | 1 | 0  | 0 | –  | –  | 1 | 2     | 211 |
| 3 | warm-2 | – | –   | 0 | 1  | 0 | –  | –  | 0 | 1     | 172 |
| 4 | warm-3 | – | –   | 0 | 1  | 0 | –  | –  | 0 | 1     | 160 |
| 5 | warm-4 | – | –   | 0 | 1  | 0 | –  | –  | 0 | 1     | 177 |
| 6 | warm-5 | – | –   | 0 | 1  | 0 | –  | –  | 0 | 1     | 247 |

(– = stage skipped on warm hits because the model session is cached, per spec.)

Expected-delta check vs `91eee47e`:

- `postprocess_ms` now recorded on every row ✓ (was absent).
- Predictor outputs validate as `[mu, log_var]`-shaped `float32 [1,128]` ✓ (`outputShape`, `outputDtype` in raw).
- Execution proceeds into reflection and produces `reflect_model_fetch_ms`, `reflect_session_init_ms`, `reflection_inference_ms` ✓.
- Warm calls show `predictorCold:false, reflectionCold:false` and aggregate `coldStart:false` ✓.
- Breaker remains `closed` with `circuitFailures:0` on every row ✓.

## Breaker behavior

| run    | circuitState | circuitFailures | reason |
|---|---|---|---|
| cold   | closed | 0 | — |
| warm-1 | closed | 0 | — |
| warm-2 | closed | 0 | — |
| warm-3 | closed | 0 | — |
| warm-4 | closed | 0 | — |
| warm-5 | closed | 0 | — |

No transitions observed because no latency budget was violated (warm ≤ 2 ms ≪ 600 ms, cold 504 ms ≪ 5,000 ms) and no inference failure occurred.

## Bundle size

Not re-enumerated for this rerun; artifacts unchanged from `91eee47e`. Predictor shrank from 2.63 MB to 737,546 bytes; reflection artifact byte-identical; route lambda stays well under the 150 MB ceiling.

## Verdict

PASS on both axes:
- Cold: 504 ms ≤ 5,000 ms cold budget.
- Warm: 1–2 ms ≤ 600 ms warm budget.
- Reflection leg now observable end-to-end.

The full-stack path is compatible with the synchronous Vercel lane on this artifact set. Hot path (= warm, both sessions cached) is in the low single-digit milliseconds; cold path is dominated by predictor `session_init` (406 ms of 504 ms total), which is plausible for ORT WASM graph init and not a regression.

## Caveats and mislabels to carry forward

1. **Warm-up hit consumed the truly-virgin cold of one lambda.** The harness `cold` row still landed on a fresh container so the cold shape is faithful, but the report does not claim it is the first request ever made against this deployment. Future reruns should not warm-up probe.
2. **Reflection is still an untrained probe artifact.** Latency numbers are architecture/runtime evidence only.
3. **Predictor binary provenance remains labeled `unknown_existing_artifact`.** The integrity gate now guarantees size-vs-meta but cannot vouch for checkpoint lineage. Do not promote this to "trained model is fast".
4. **The previously-flagged breaker mislabel (`output_invalid` while open)** is no longer operative — the underlying predictor-postprocess failure was the artifact swap and is fixed; the breaker remains correct in this run because it never tripped.

## Conclusion (boilerplate required by spec)

> Reflection latency measurements are architecture/runtime evidence only.
> The measured artifact contains freshly initialized weights and provides
> no evidence of semantic model quality.

## Decision input

Previous slice banker/decision: predictor path was plausibly OK, reflection path was unknown. Rerun answer: **both legs fit the synchronous Vercel lane on the current artifact set** with order-of-magnitude headroom under both budgets. The architecture choice between (A) warm/background, (B) client/local WASM, (C) durable async inference is now informed by:

- cold ≈ 500 ms total, dominated by predictor session init
- warm ≈ 1–2 ms total, all stages sub-millisecond

This points away from needing (C) durable execution for JEPA inference *on these artifacts* and towards (A) with periodic warm-keeping if cold tail matters, or (B) if moving the runtime to the client is a deliberate UX/offline choice. Hard requirement changes (larger predictor, trained reflection expert, multi-tenant latency SLOs) re-open this decision.
