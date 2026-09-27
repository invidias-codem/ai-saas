# JEPA real-model shadow probe — rerun after predictor artifact repair

**Status:** preview-trigger pending. Baseline see `jepa-real-model-probe-report.md` (run `91eee47e`).
**Reference commit:** `b34fcea1` (PR #385) — restored `public/wasm/predictor.onnx` to canonical 737,546-byte int8 export and added size/meta integrity gate.
**Parent spec:** `research/world-model/jepa-real-model-shadow-probe-spec.md`.

> **Note on historical evidence:** the prior experiment `91eee47e` is preserved as-is. Its report statement "reflection loader failure" was accurate in form but mis-attributed in cause — new evidence from the split-copy artifact diff shows the request failed during **predictor output validation** before the reflection leg was reached. `output_invalid` was the breaker's preserved `lastReason` (from predictor postprocess failure), not an open-path mislabeling of a reflection-side error.

This file will be rewritten to *pending → measured* with the new raw JSONL committed alongside as `jepa-real-model-probe-report-rerun.raw.jsonl`.
