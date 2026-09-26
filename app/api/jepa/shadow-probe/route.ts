/**
 * app/api/jepa/shadow-probe/route.ts
 *
 * ISOLATED instrumentation endpoint for the JEPA real-model latency
 * shadow-probe slice (research/world-model/jepa-real-model-shadow-probe-spec.md).
 *
 * - Loads predictor.onnx (+ reflection_expert.onnx if present) with
 *   onnxruntime-web WASM EP and records per-stage timings.
 * - Fail-closed circuit breaker with typed reason codes.
 * - Gated: ENABLE_JEPA=true on Preview only. Production keeps it off.
 * - Never called from any other Lattice route. No traffic uses this
 *   to make decisions.
 *
 * Per-stage timings recorded (ms):
 *   model_fetch_ms, wasm_init_ms, session_init_ms (predictor),
 *   reflect_model_fetch_ms, reflect_session_init_ms,
 *   preprocess_ms, predictor_inference_ms, reflection_inference_ms,
 *   postprocess_ms, total_ms
 *
 * Failure reasons (typed, exactly one when circuit is open or call fails):
 *   cold_start_budget_exceeded | model_load_failed | session_init_failed
 *   inference_budget_exceeded | memory_pressure | output_invalid
 *
 * PONYTAIL: this route reuses `lib/jepa/circuitBreaker.ts` as-is. The
 * breaker already logs to Supabase via divergenceTelemetry; that side-
 * effect is acceptable at preview-volume and keeps the diff minimal.
 */

import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';
import { CircuitBreaker } from '@/lib/jepa/circuitBreaker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROBE_FLAG = process.env.ENABLE_JEPA === 'true';

const LATENT_DIM = 128;

// Budgets
const WARM_BUDGET_MS = 600;
const COLD_BUDGET_MS = 5_000;

type StageFailureReason =
  | 'cold_start_budget_exceeded'
  | 'model_load_failed'
  | 'session_init_failed'
  | 'inference_budget_exceeded'
  | 'memory_pressure'
  | 'output_invalid';

interface StageTimings {
  model_fetch_ms?: number;
  wasm_init_ms?: number;
  session_init_ms?: number;
  reflect_model_fetch_ms?: number;
  reflect_session_init_ms?: number;
  preprocess_ms?: number;
  predictor_inference_ms?: number;
  reflection_inference_ms?: number;
  postprocess_ms?: number;
  total_ms: number;
}

interface ProbeRecord {
  flag: true;
  nodeEnv: string;
  vercel: string;
  timestamp: string;
  routeRegion: string | undefined;
  coldStart: boolean;
  modelBytes?: number;
  reflectModelBytes?: number;
  wasmAssetBytes?: number;
  timings: StageTimings;
  circuitState: 'closed' | 'open' | 'half-open';
  reason?: StageFailureReason;
  error?: string;
  outputShape?: number[];
  outputDtype?: string;
  verdict: 'PASS' | 'FAIL';
}

const breaker = new CircuitBreaker({
  latencyBudgetMs: WARM_BUDGET_MS,
  failureThreshold: 3,
  cooldownMs: 30_000,
  halfOpenMaxProbes: 1,
});

// Per-lambda-instance cache
let cachedPredictor: ort.InferenceSession | null = null;
let cachedReflection: ort.InferenceSession | null = null;

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const out = await fn();
  return [out, Date.now() - t];
}

async function loadModelBytes(name: string): Promise<[Buffer, number]> {
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

export async function GET() {
  if (!PROBE_FLAG) {
    return NextResponse.json(
      { error: 'JEPA shadow probe disabled (ENABLE_JEPA != true)', flag: false },
      { status: 404 },
    );
  }

  const startedTotal = Date.now();
  const record: ProbeRecord = {
    flag: true,
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL || 'false',
    timestamp: new Date().toISOString(),
    routeRegion: process.env.VERCEL_REGION,
    coldStart: cachedPredictor === null,
    timings: { total_ms: 0 },
    circuitState: breaker.getState(),
    verdict: 'PASS',
  };

  if (!breaker.allowRequest()) {
    record.circuitState = 'open';
    record.reason = 'inference_budget_exceeded';
    record.verdict = 'FAIL';
    record.timings.total_ms = Date.now() - startedTotal;
    return NextResponse.json(record, { status: 503 });
  }

  try {
    // Stage: WASM init (config only — actual wasm bind happens at session.create)
    const [, wasmInitMs] = await timed(async () => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = wasmPaths();
    });
    record.timings.wasm_init_ms = wasmInitMs;

    // Stage: predictor model fetch
    if (!cachedPredictor) {
      try {
        const [buf, fetchMs] = await loadModelBytes('predictor.onnx');
        record.timings.model_fetch_ms = fetchMs;
        record.modelBytes = buf.length;

        // Stage: predictor session init
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
          record.error = `predictor session: ${e?.message || String(e)}`;
          throw e;
        }
      } catch (e: any) {
        if (!record.reason) {
          record.reason = 'model_load_failed';
          record.error = `predictor model load: ${e?.message || String(e)}`;
        }
        throw e;
      }
    }

    // Stage: reflection model fetch + session init (optional; artifact may not exist)
    if (!cachedReflection) {
      try {
        const [buf, fetchMs] = await loadModelBytes('reflection_expert.onnx');
        record.timings.reflect_model_fetch_ms = fetchMs;
        record.reflectModelBytes = buf.length;
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
          record.error = `reflection session: ${e?.message || String(e)}`;
          throw e;
        }
      } catch (e: any) {
        if (!record.reason) {
          record.reason = 'model_load_failed';
          record.error = `reflection model load: ${e?.message || String(e)}`;
        }
        throw e;
      }
    }

    // Stage: preprocess — deterministic latent vector (cold-vs-warm comparability)
    const [preOut, preprocessMs] = await timed(async () => {
      const z = new Float32Array(LATENT_DIM);
      for (let i = 0; i < LATENT_DIM; i++) z[i] = (i % 7) / 7;
      return {
        zTensor: new ort.Tensor('float32', z, [1, LATENT_DIM]),
      };
    });
    record.timings.preprocess_ms = preprocessMs;

    // Stage: predictor inference
    const [predOut, predMs] = await timed(() =>
      cachedPredictor!.run({ z: preOut.zTensor }),
    );
    record.timings.predictor_inference_ms = predMs;

    // Stage: reflection inference (uses z_stuck == z_context == z for probe)
    const [reflectOut, reflectMs] = await timed(() =>
      cachedReflection!.run({
        z_stuck: preOut.zTensor,
        z_context: preOut.zTensor,
      }),
    );
    record.timings.reflection_inference_ms = reflectMs;

    // Stage: postprocess (sparse variance emit per VJEPA pattern)
    const [, postMs] = await timed(async () => {
      const muData = Array.from(predOut.mu.data as Float32Array);
      const logVarData = Array.from(predOut.log_var.data as Float32Array);
      if (muData.length !== LATENT_DIM || logVarData.length !== LATENT_DIM) {
        throw new Error('output_invalid: mu/log_var dim mismatch');
      }
      if (!reflectOut.z_past || !reflectOut.z_hyper_future) {
        throw new Error('output_invalid: reflection outputs missing');
      }
    });
    record.timings.postprocess_ms = postMs;

    const totalMs = Date.now() - startedTotal;
    record.timings.total_ms = totalMs;
    record.outputShape = (predOut.mu.dims as number[]) || undefined;
    record.outputDtype = (predOut.mu.type as string) || undefined;

    // Budget check — but only fail if it materially exceeds, so we can
    // see the actual distribution. Spec: do not game against 600ms.
    const overWarm = !record.coldStart && totalMs > WARM_BUDGET_MS;
    const overCold = record.coldStart && totalMs > COLD_BUDGET_MS;
    if (overWarm) record.reason = 'inference_budget_exceeded';
    if (overCold) record.reason = 'cold_start_budget_exceeded';
    if (overWarm || overCold) {
      record.verdict = 'FAIL';
      breaker.recordFailure(totalMs);
    } else {
      breaker.recordSuccess();
    }
    record.circuitState = breaker.getState();

    return NextResponse.json(record, {
      status: record.verdict === 'PASS' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    const totalMs = Date.now() - startedTotal;
    record.timings.total_ms = totalMs;
    if (!record.reason) {
      const msg = e?.message || String(e);
      record.error = msg;
      if (/memory|heap|out of memory/i.test(msg)) record.reason = 'memory_pressure';
      else record.reason = 'output_invalid';
    }
    record.verdict = 'FAIL';
    breaker.recordFailure(totalMs);
    record.circuitState = breaker.getState();
    return NextResponse.json(record, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
