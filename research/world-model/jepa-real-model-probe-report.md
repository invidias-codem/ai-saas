# JEPA real-model shadow probe — runtime report

**Status:** TEMPLATE — fill after bounded #382 harness run against `reflection_expert_probe_untrained.onnx`.
**Slice spec:** `research/world-model/jepa-real-model-shadow-probe-spec.md`.

## Provenance (must remain accurate on submission)

| Slot | File | Training state | Semantic validity |
|---|---|---|---|
| predictor | `public/wasm/predictor.onnx` | `unknown_existing_artifact` | `unknown` |
| reflection | `public/wasm/reflection_expert_probe_untrained.onnx` | `untrained_probe_only` | **false** |

## Method

- Script: `scripts/jepa-real-model-probe.sh <preview-url>`
- Route: `GET /api/jepa/shadow-probe` (Preview only, `ENABLE_JEPA=true`)
- Sequence: 1 cold + 5 warm @ 2s apart
- No CDN fetch measurement; bundled-local only
- No 7th unbounded cold run unless bounded cold >5s

## Measured timings (ms)

| Run | label | model_fetch | session_init | preprocess | predictor_inference | reflect_model_fetch | reflect_session_init | reflection_inference | postprocess | total |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | cold | – | – | – | – | – | – | – | – | – |
| 2 | warm-1 | – | – | – | – | – | – | – | – | – |
| 3 | warm-2 | – | – | – | – | – | – | – | – | – |
| 4 | warm-3 | – | – | – | – | – | – | – | – | – |
| 5 | warm-4 | – | – | – | – | – | – | – | – | – |
| 6 | warm-5 | – | – | – | – | – | – | – | – | – |

(jsonl raw rows committed alongside at `jepa-real-model-probe-report.raw.jsonl`.)

## Breaker behavior

- Consecutive failures reaching threshold: –
- Cooldown opened: yes / no
- Time-to-half-open: –

## Bundle size

`vercel inspect` row for `api/jepa/shadow-probe`: – MB (target <150 MB)

## Verdict

PASS / FAIL with respect to the spec's `warm_budget = 600ms`, `cold_budget = 5000ms`.

## Conclusion (boilerplate required by spec)

> Reflection latency measurements are architecture/runtime evidence only.
> The measured artifact contains freshly initialized weights and provides
> no evidence of semantic model quality.

[One sentence on which of A (warm/background), B (client/local WASM), or C (durable async) the timing data points to. If cold stays multi-second, that is the answer. Keep it under three sentences total.]
