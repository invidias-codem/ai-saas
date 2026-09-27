# JEPA real-model shadow probe — runtime report

**Status:** bounded run completed. Findings below; the predictor half of the question is answered, the reflection half is bounded but not measured.
**Slice spec:** `research/world-model/jepa-real-model-shadow-probe-spec.md`.
**Preview deployment:** `dpl_31p1opkmm` from main `ea560e15`, region `iad1`. Flag re-disabled after run.

## Provenance (must remain accurate)

| Slot | File | trainingState | semanticValidity |
|---|---|---|---|
| predictor | `public/wasm/predictor.onnx` | `unknown_existing_artifact` | `unknown` |
| reflection | `public/wasm/reflection_expert_probe_untrained.onnx` | `untrained_probe_only` | **false** |

## Method

- Script: `scripts/jepa-real-model-probe.sh <preview-url>` (1 cold + 5 warm @ 2 s apart, strict JSONL)
- Route: `GET /api/jepa/shadow-probe` (Preview only, `ENABLE_JEPA=true`; flag disabled post-run)
- Raw rows: `jepa-real-model-probe-report.raw.jsonl`
- No CDN fetch measurement; bundled-local artifact only.
- Optional 7th unbounded cold run intentionally **skipped** — cold total was 621 ms, well under the 5 s ceiling.

## Measured timings (ms)

| Run | label | model_fetch | session_init | preprocess | predictor_inference | reflect_model_fetch | reflect_session_init | reflection_inference | postprocess | total |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | cold   | 26 | 583 | 0 | 11 | – | – | – | – | **621** |
| 2 | warm-1 | –  | –   | 0 | 1  | – | – | – | – | 1 |
| 3 | warm-2 | –  | –   | 0 | 1  | – | – | – | – | 1 |
| 4 | warm-3 | –  | –   | – | –  | – | – | – | – | 1 |
| 5 | warm-4 | –  | –   | – | –  | – | – | – | – | 0 |
| 6 | warm-5 | –  | –   | – | –  | – | – | – | – | 0 |

(– = stage not reached on that request because the reflection leg failed before instrumentation.)

## Breaker behavior

| run | circuitState | circuitFailures | reason |
|---|---|---|---|
| cold    | closed | 1 | (predictor leg completed; reflection leg failed before typed reason) |
| warm-1  | closed | 2 | — |
| warm-2  | **open**  | **3** | — |
| warm-3  | open   | 3 | output_invalid (recorded on open path; mislabeled — see caveats) |
| warm-4  | open   | 3 | output_invalid |
| warm-5  | open   | 3 | output_invalid |

Spec-conformant state transitions confirmed: 3 consecutive failures opened the circuit; subsequent calls fail fast while `coldStart:true` is held because the reflection session never cached. The breaker semantics are correct; the `reason` field on open responses needs work (see caveats).

## Bundle size

Captured from `vercel inspect` for `api/jepa/shadow-probe`: not separately enumerated; max route lambda in this deploy was 51.87 MB (well under 150 MB). The ONNX+WASM artifacts ride in `public/wasm/` (`predictor` 2.63 MB, `reflection_expert_probe_untrained` 1.16 MB, ort-wasm-simd-threaded.wasm 13.5 MB) and are NOT bundled into the route lambda — they are streamed from the same deployment.

## Verdict

PARTIAL PASS on the predictor axis:
- Cold: 621 ms ≤ 5 000 ms cold budget.
- Warm: 1 ms ≤ 600 ms warm budget.

FAIL on the reflection axis (design expectation): reflection leg did not initialize in any of 6 attempts; per-stage reflection timings were not measured. Predictor evidence is preserved because the route records the predictor leg before attempting reflection.

## Caveats and mislabels to carry forward

1. **`reason: 'output_invalid'` on circuit-open responses is misleading.** It is the catch-all from the open path, not the original failure that opened the circuit. Spec asked for the *originating* reason to survive. The current implementation records `lastReason` but doesn't surface it; the open-path uses a hard-coded fallback. Fix in a follow-up slice: persist the first failure's typed reason and report it while open.

2. **Reflection stage timings are all absent**, not zero. The reflection leg fails before its first stage (`reflect_model_fetch_ms` is the earliest observable). The probe never reached session-init for reflection, so the distribution that actually matters for the runtime-cost question is **unmeasured**, not within-budget.

3. **`coldStart:true` persists across warm runs** because warm-vs-cold is gated on the union of predictor+reflection sessions. Predictor cached correctly (predictor_inference_ms = 1), reflection never did, so `coldStart` keeps reporting true. This is a faithful render of partial readiness but means the experiment did not measure a true "warm" path. Future slice should split per-leg verdicts.

4. **Predictor binary provenance remains unknown.** Predictor cold start (model_fetch + session_init + inference = 620 ms of the 621 ms total) is the right order of magnitude for graph-load, not for inference of useful weights. Do not promote this to "trained model is fast" — the live worker may have written the file and may not have.

5. **The probe intentionally responded before checking the breaker** so the very first cold call had a chance to load. That is the spec'd behavior, but it does mean the first row reflects an un-budgeted attempt. Subsequent calls observed the breaker correctly.

## Conclusion (boilerplate required by spec)

> Reflection latency measurements are architecture/runtime evidence only.
> The measured artifact contains freshly initialized weights and provides
> no evidence of semantic model quality.

## Decision input

The 621 ms cold / 1 ms warm for the predictor path is **compatible with the synchronous Vercel lane**. The reflection leg's failure mode here is a *loader blocking bug in the probe path*, not the trained reflection model. Until reflection totals exist, the architecture call between (A) warm/background execution, (B) client/local WASM execution, or (C) durable async inference is undecided. The next bounded slice is the reflection loader failure root-cause, not new architecture work.
