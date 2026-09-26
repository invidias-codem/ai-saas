/**
 * app/api/jepa/shadow-probe/route.ts
 *
 * ISOLATED instrumentation endpoint for the JEPA real-model latency
 * shadow-probe slice (research/world-model/jepa-real-model-shadow-probe-spec.md).
 *
 * - Loads predictor.onnx via onnxruntime-web WASM EP first; preserves
 *   predictor timings/output even when the (currently missing)
 *   reflection_expert.onnx fails its own leg.
 * - Per-leg cold/warm classification is explicit (predictorCold,
 *   reflectionCold) so partial caching doesn't lie to the report.
 * - Probe-local circuit breaker with the spec's exact semantics:
 *   3 consecutive failures -> open; 30s cooldown -> half-open;
 *   one half-open failure -> reopen. Total-ms-only comparisons
 *   would contaminate typed reasons, so recordFailure takes a
 *   StageFailureReason.
 * - Gated: ENABLE_JEPA=true on Preview only.
 *
 * Per-stage timings recorded (ms):
 *   model_fetch_ms, session_init_ms, preprocess_ms,
 *   predictor_inference_ms, postprocess_ms,
 *   reflect_model_fetch_ms, reflect_session_init_ms, reflection_inference_ms,
 *   wasm_config_ms, total_ms
 *
 * wasm_config_ms is `ort.env.wasm` CONFIGURATION assignment only. Actual
 * WASM engine initialization happens inside InferenceSession.create and
 * is folded into session_init_ms. We do not mislabel this as WASM init.
 *
 * PONYTAIL: file scope only the slice requires. Existing
 * lib/jepa/circuitBreaker.ts is NOT reused because its
 * latency-opens-immediately semantics contradict this spec. That class
 * still serves the live /api/jepa/predict route.
 */

import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROBE_FLAG = process.env.ENABLE_JEPA === 'true';

const LATENT_DIM = 128;
const WARM_BUDGET_MS = 600;
const COLD_BUDGET_MS = 5_000;
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

type StageFailureReason =
  | 'cold_start_budget_exceeded'
  | 'model_load_failed'
  | 'session_init_failed'
  | 'inference_budget_exceeded'
  | 'memory_pressure'
  | 'output_invalid';

type CircuitState = 'closed' | 'open' | 'half-open';

interface StageTimings {
  wasm_config_ms?: number;
  model_fetch_ms?: number;
  session_init_ms?: number;
  preprocess_ms?: number;
  predictor_inference_ms?: number;
  postprocess_ms?: number;
  reflect_model_fetch_ms?: number;
  reflect_session_init_ms?: number;
  reflection_inference_ms?: number;
  total_ms: number;
}

interface ProbeRecord {
  flag: true;
  nodeEnv: string;
  vercel: string;
  timestamp: string;
  routeRegion: string | undefined;
  predictorCold: boolean;
  reflectionCold: boolean;
  coldStart: boolean; // overall: any leg still cold at request entry
  modelBytes?: number;
  reflectModelBytes?: number;
  timings: StageTimings;
  circuitState: CircuitState;
  circuitFailures: number;
  reason?: StageFailureReason;
  reflectionError?: string;
  outputShape?: number[];
  outputDtype?: string;
  verdict: 'PASS' | 'FAIL';
}

// Probe-local breaker with the exact spec'd semantics. Kept module-scope
// so its state persists across warm invocations on the same lambda.
class ProbeBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeIssued = false;
  private lastReason?: StageFailureReason;

  allowRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') {
      if (this.halfOpenProbeIssued) return false;
      this.halfOpenProbeIssued = true;
      return true;
    }
    if (Date.now() - this.openedAt >= COOLDOWN_MS) {
      this.state = 'half-open';
      this.halfOpenProbeIssued = true;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    // Any success closes the circuit and resets the consecutive counter,
    // including a success from half-open.
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.halfOpenProbeIssued = false;
    this.lastReason = undefined;
  }

  recordFailure(reason: StageFailureReason): void {
    this.consecutiveFailures++;
    this.lastReason = reason;
    if (this.state === 'half-open') {
      // Spec: one failure from half-open reopens.
      this.state = 'open';
      this.openedAt = Date.now();
      this.halfOpenProbeIssued = false;
      return;
    }
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
  getLastReason(): StageFailureReason | undefined {
    return this.lastReason;
  }
}

const breaker = new ProbeBreaker();

let cachedPredictor: ort.InferenceSession | null = null;
let cachedReflection: ort.InferenceSession | null = null;

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const out = await fn();
  return [out, Date.now() - t];
}

async function fetchModelBytes(name: string): Promise<[Buffer, number]> {
  return timed(async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const p = path.join(process.cwd(), 'public', 'wasm', name);
    return fs.readFileSync(p);
  });
}

function wasmPaths(): { wasm: string; mjs: string } {
  const dir = `${process.cwd()}/public/wasm`;
  return {
    wasm: `file://${dir}/ort-wasm-simd-threaded.wasm`,
    mjs: `file://${dir}/ort-wasm-simd-threaded.mjs`,
  };
}

function classifyError(e: unknown): StageFailureReason {
  const msg = e instanceof Error ? e.message : String(e);
  if (/memory|heap|out of memory|ENOMEM/i.test(msg)) return 'memory_pressure';
  return 'output_invalid';
}

export async function GET() {
  if (!PROBE_FLAG) {
    return NextResponse.json(
      { error: 'JEPA shadow probe disabled (ENABLE_JEPA != true)', flag: false },
      { status: 404 },
    );
  }

  const startedTotal = Date.now();
  const predictorCold = cachedPredictor === null;
  const reflectionCold = cachedReflection === null;

  const record: ProbeRecord = {
    flag: true,
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL || 'false',
    timestamp: new Date().toISOString(),
    routeRegion: process.env.VERCEL_REGION,
    predictorCold,
    reflectionCold,
    coldStart: predictorCold || reflectionCold,
    timings: { total_ms: 0 },
    circuitState: breaker.getState(),
    circuitFailures: breaker.getConsecutiveFailures(),
    verdict: 'PASS',
  };

  if (!breaker.allowRequest()) {
    record.circuitState = 'open';
    record.reason = breaker.getLastReason() ?? 'inference_budget_exceeded';
    record.verdict = 'FAIL';
    record.timings.total_ms = Date.now() - startedTotal;
    return NextResponse.json(record, { status: 503 });
  }

  // Note: `reason` will hold the FIRST failure we observed. If predictor
  // succeeds but reflection fails, reason reflects the reflection leg so
  // the predictor timings aren't lost as noise. Circuit opening uses the
  // last observed reason as the surviving evidence of why it tripped.

  // ========== PREDICTOR LEG ==========
  // Must complete (or fail with its own typed reason) regardless of the
  // reflection leg, because the bounded run's core evidence is predictor
  // latency distribution.

  try {
    // WASM configuration (NOT init — actual WASM engine binding happens
    // inside InferenceSession.create below).
    const [, wasmConfigMs] = await timed(async () => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = wasmPaths();
    });
    record.timings.wasm_config_ms = wasmConfigMs;

    if (!cachedPredictor) {
      // Stages: model fetch + session init (the latter is where the WASM
      // engine actually binds and is the dominant cold cost).
      let buf: Buffer;
      try {
        const [b, fetchMs] = await fetchModelBytes('predictor.onnx');
        buf = b;
        record.timings.model_fetch_ms = fetchMs;
        record.modelBytes = b.length;
      } catch (e: any) {
        record.reason = 'model_load_failed';
        record.reflectionError = `predictor fetch: ${e?.message || String(e)}`;
        throw e;
      }

      try {
        const [sess, initMs] = await timed(() =>
          ort.InferenceSession.create(buf as unknown as ArrayBuffer, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
          }),
        );
        record.timings.session_init_ms = initMs;
        cachedPredictor = sess;
      } catch (e: any) {
        record.reason = 'session_init_failed';
        record.reflectionError = `predictor session: ${e?.message || String(e)}`;
        throw e;
      }
    }

    // Stage: preprocess (deterministic latent vector for cross-run compare)
    const [pre, preprocessMs] = await timed(async () => {
      const z = new Float32Array(LATENT_DIM);
      for (let i = 0; i < LATENT_DIM; i++) z[i] = (i % 7) / 7;
      return new ort.Tensor('float32', z, [1, LATENT_DIM]);
    });
    record.timings.preprocess_ms = preprocessMs;

    // Stage: predictor inference
    let predOut: ort.InferenceSession.OnnxValueMapType;
    try {
      const [out, infMs] = await timed(() => cachedPredictor!.run({ z: pre }));
      predOut = out;
      record.timings.predictor_inference_ms = infMs;
    } catch (e: any) {
      record.reason = classifyError(e);
      record.reflectionError = `predictor inference: ${e?.message || String(e)}`;
      throw e;
    }

    // Stage: postprocess (validate predictor output shape; sparse variance
    // folding per VJEPA pattern is a separate stage in the live route, for
    // the probe we just confirm shape matches expectation).
    const [, postMs] = await timed(async () => {
      const mu = predOut.mu?.data as Float32Array | undefined;
      const lv = predOut.log_var?.data as Float32Array | undefined;
      if (!mu || !lv || mu.length !== LATENT_DIM || lv.length !== LATENT_DIM) {
        throw new Error('output_invalid: mu/log_var shape mismatch');
      }
    });
    record.timings.postprocess_ms = postMs;
    record.outputShape = (predOut.mu.dims as number[]) || undefined;
    record.outputDtype = (predOut.mu.type as string) || undefined;
  } catch {
    // Predictor leg failed; reason already set above. Skip reflection.
    const totalMs = Date.now() - startedTotal;
    record.timings.total_ms = totalMs;
    record.verdict = 'FAIL';
    breaker.recordFailure(record.reason ?? 'output_invalid');
    record.circuitState = breaker.getState();
    record.circuitFailures = breaker.getConsecutiveFailures();
    return NextResponse.json(record, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // ========== REFLECTION LEG ==========
  // Independent of predictor evidence. Known-missing artifact surfaces as
  // model_load_failed for THIS leg. We deliberately do not catch reflection
  // errors at the route level so the typed reason is preserved.

  const z_stuck = new ort.Tensor(
    'float32',
    new Float32Array(LATENT_DIM).fill(0),
    [1, LATENT_DIM],
  );

  try {
    if (!cachedReflection) {
      let buf: Buffer;
      try {
        const [b, fetchMs] = await fetchModelBytes('reflection_expert.onnx');
        buf = b;
        record.timings.reflect_model_fetch_ms = fetchMs;
        record.reflectModelBytes = b.length;
      } catch (e: any) {
        record.reason = 'model_load_failed';
        record.reflectionError = `reflection fetch: ${e?.message || String(e)}`;
        throw e;
      }

      try {
        const [sess, initMs] = await timed(() =>
          ort.InferenceSession.create(buf as unknown as ArrayBuffer, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all',
          }),
        );
        record.timings.reflect_session_init_ms = initMs;
        cachedReflection = sess;
      } catch (e: any) {
        record.reason = 'session_init_failed';
        record.reflectionError = `reflection session: ${e?.message || String(e)}`;
        throw e;
      }
    }

    // Stage: reflection inference
    const [reflectOut, reflectMs] = await timed(() =>
      cachedReflection!.run({ z_stuck, z_context: z_stuck }),
    );
    record.timings.reflection_inference_ms = reflectMs;

    // Sanity: reflection output should carry both heads
    if (!reflectOut.z_past || !reflectOut.z_hyper_future) {
      throw new Error('output_invalid: reflection outputs missing');
    }
  } catch (e: any) {
    // Reflection leg failed; predictor evidence above is preserved.
    if (!record.reason) {
      record.reason = classifyError(e);
      record.reflectionError = `reflection: ${e?.message || String(e)}`;
    }
    const totalMs = Date.now() - startedTotal;
    record.timings.total_ms = totalMs;
    record.verdict = 'FAIL';
    breaker.recordFailure(record.reason);
    record.circuitState = breaker.getState();
    record.circuitFailures = breaker.getConsecutiveFailures();
    return NextResponse.json(record, {
      status: 200, // predictor leg succeeded; surface evidence at 200 with verdict FAIL
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // ========== BOTH LEGS SUCCEEDED ==========
  const totalMs = Date.now() - startedTotal;
  record.timings.total_ms = totalMs;

  const overWarm = !record.coldStart && totalMs > WARM_BUDGET_MS;
  const overCold = record.coldStart && totalMs > COLD_BUDGET_MS;
  if (overWarm) record.reason = 'inference_budget_exceeded';
  if (overCold) record.reason = 'cold_start_budget_exceeded';
  if (overWarm || overCold) {
    record.verdict = 'FAIL';
    breaker.recordFailure(record.reason!);
  } else {
    breaker.recordSuccess();
  }
  record.circuitState = breaker.getState();
  record.circuitFailures = breaker.getConsecutiveFailures();

  return NextResponse.json(record, {
    status: record.verdict === 'PASS' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
