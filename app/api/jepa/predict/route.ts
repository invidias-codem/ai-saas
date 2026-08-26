import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Module-level session cache and initialization lock for warm-start amortization.
let cachedPredictorSession: ort.InferenceSession | null = null;
let initializationPromise: Promise<ort.InferenceSession> | null = null;

async function getPredictorSession(): Promise<ort.InferenceSession> {
  if (cachedPredictorSession) {
    return cachedPredictorSession;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    // Force single-threaded to prevent Vercel Web Worker crashes
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

    // Pad or truncate to predictor input dim from JEPAConfig.embedding_dim.
    // The Python export uses embedding_dim as the fixed input width.
    const inputDim = 256;
    const input = new Float32Array(inputDim);
    for (let i = 0; i < Math.min(latentState.length, inputDim); i++) {
      input[i] = Number(latentState[i]);
    }

    const inputTensor = new ort.Tensor('float32', input, [1, inputDim]);
    const results = await session.run({ z: inputTensor });
    const output = results['z_pred'];
    const predictedState = output?.data ? Array.from(output.data as Float32Array) : null;

    return NextResponse.json({
      status: 'success',
      predictedState,
      totalMs: Date.now() - started,
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
