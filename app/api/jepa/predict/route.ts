import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Module-level session cache and initialization lock for warm-start amortization.
let cachedPredictorSession: ort.InferenceSession | null = null;
let initializationPromise: Promise<ort.InferenceSession> | null = null;

// Fixed VJEPA latent dimension. The Python export uses embedding_dim=128;
// changing this requires retraining + re-export.
const LATENT_DIM = 128;

// Circuit-breaker threshold: if max diagonal variance exceeds this, the
// prediction is treated as too uncertain and the caller falls back to
// deterministic syntactic planning.
const CIRCUIT_BREAKER_MAX_VARIANCE = 0.95;

// Variance sparse threshold: only emit indices where exp(log_var) > this.
const VARIANCE_SPARSE_THRESHOLD = 0.01;

// Latency budget (ms). Cold-start allows WASM/ONNX load; warm-start must
// stay within this envelope.
const WARM_START_LATENCY_BUDGET_MS = 250;
const COLD_START_LATENCY_BUDGET_MS = 3000;

async function getPredictorSession(): Promise<ort.InferenceSession> {
  if (cachedPredictorSession) {
    return cachedPredictorSession;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    // Force single-threaded to prevent Vercel Web Worker crashes.
    ort.env.wasm.numThreads = 1;

    const wasmDir = `${process.cwd()}/public/wasm`;
    ort.env.wasm.wasmPaths = {
      wasm: `file://${wasmDir}/ort-wasm-simd-threaded.wasm`,
      mjs: `file://${wasmDir}/ort-wasm-simd-threaded.mjs`,
    };

    const modelPath = `${wasmDir}/predictor.onnx`;
    const modelBuffer = require('node:fs').readFileSync(modelPath);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    cachedPredictorSession = session;
    return session;
  })();

  return initializationPromise;
}

function toFloat32Array(input: number[] | null | undefined): Float32Array {
  const arr = new Float32Array(LATENT_DIM);
  if (!input) return arr;
  for (let i = 0; i < Math.min(input.length, LATENT_DIM); i++) {
    arr[i] = Number(input[i]);
  }
  return arr;
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const body = await request.json();
    const latentState = Array.isArray(body.latentState) ? body.latentState : null;

    if (!latentState || latentState.length === 0) {
      return NextResponse.json(
        { error: 'Missing latentState in payload' },
        { status: 400 }
      );
    }

    const session = await getPredictorSession();
    const input = toFloat32Array(latentState);
    const inputTensor = new ort.Tensor('float32', input, [1, LATENT_DIM]);
    const results = await session.run({ z: inputTensor });

    const mu = results.mu;
    const logVar = results.log_var;
    if (!mu || !logVar) {
      return NextResponse.json(
        {
          status: 'error',
          fallbackToSyntactic: true,
          error: 'predictor.onnx missing mu/log_var outputs; expected VJEPA dual-output model',
        },
        { status: 500 }
      );
    }

    const muData = Array.from(mu.data as Float32Array);
    const logVarData = Array.from(logVar.data as Float32Array);

    // Optional variance calibration multiplier. In production this is 1.0;
    // during staging validation you can raise it to verify circuit-breaker
    // behavior without retraining the ONNX graph.
    const varianceScale = Number(process.env.JEPA_VARIANCE_SCALE || '1.0');

    // Build sparse variance response.
    const varIndices: number[] = [];
    const varValues: number[] = [];
    let sumVar = 0;
    let maxVar = -Infinity;

    for (let i = 0; i < logVarData.length; i++) {
      const v = Math.exp(logVarData[i] * varianceScale);
      sumVar += v;
      if (v > maxVar) maxVar = v;
      if (v > VARIANCE_SPARSE_THRESHOLD) {
        varIndices.push(i);
        varValues.push(v);
      }
    }

    const meanVariance = sumVar / LATENT_DIM;
    const totalMs = Date.now() - started;
    const isWarmStart = !!cachedPredictorSession;
    const latencyBudget = isWarmStart
      ? WARM_START_LATENCY_BUDGET_MS
      : COLD_START_LATENCY_BUDGET_MS;

    // Only trip the circuit breaker for latency on warm paths. Cold-start
    // is expected to be slow and serves to initialize the WASM cache.
    const latencyExceeded = isWarmStart && totalMs > latencyBudget;
    const fallbackToSyntactic = latencyExceeded || maxVar > CIRCUIT_BREAKER_MAX_VARIANCE;

    return NextResponse.json({
      status: 'success',
      mu: muData,
      varIndices,
      varValues,
      meanVariance,
      maxVarianceDim: maxVar,
      fallbackToSyntactic,
      totalMs,
      warmStart: !!cachedPredictorSession,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        status: 'error',
        fallbackToSyntactic: true,
        error: message,
      },
      { status: 500 }
    );
  }
}
