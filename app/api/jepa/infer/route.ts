import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JEPA_FALLBACK_ENABLED = process.env.JEPA_FALLBACK === 'true';

// Module-level session cache and initialization lock for warm-start amortization.
let cachedSession: ort.InferenceSession | null = null;
let initializationPromise: Promise<ort.InferenceSession> | null = null;

async function getJepaSession(): Promise<ort.InferenceSession> {
  // 1. Fast path: warm container, session already initialized.
  if (cachedSession) {
    return cachedSession;
  }

  // 2. Concurrency lock: prevent thundering-herd WASM init on cold start.
  if (initializationPromise) {
    return initializationPromise;
  }

  // 3. Cold-start initialization.
  initializationPromise = (async () => {
    // Force single-threaded execution to prevent Worker crashes in Vercel serverless.
    ort.env.wasm.numThreads = 1;

    // Bypass Next.js Webpack importMeta interception and chunked ESM resolution.
    const wasmDir = `${process.cwd()}/public/wasm`;
    ort.env.wasm.wasmPaths = {
      wasm: `file://${wasmDir}/ort-wasm-simd-threaded.wasm`,
      mjs: `file://${wasmDir}/ort-wasm-simd-threaded.mjs`,
    };

    const modelPath = `${wasmDir}/dummy_fp32.onnx`;
    const modelBuffer = require('fs').readFileSync(modelPath);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      wasmPaths: '/wasm/',
    });

    cachedSession = session;
    return session;
  })();

  return initializationPromise;
}

export async function POST(request: Request) {
  if (!JEPA_FALLBACK_ENABLED) {
    return NextResponse.json(
      { error: 'JEPA inference disabled' },
      { status: 501 }
    );
  }

  const started = Date.now();

  try {
    const body = await request.json();
    const session = await getJepaSession();

    // Placeholder input shape; wire to actual AST/state encoder output later.
    const inputTensor = new ort.Tensor(
      'float32',
      new Float32Array(body.latentVector || new Array(128).fill(0)),
      [1, 128]
    );

    const results = await session.run({ input: inputTensor });

    return NextResponse.json({
      status: 'success',
      totalMs: Date.now() - started,
      warmStart: !!cachedSession,
      output: results.output?.data || null,
    });
  } catch (error: any) {
    // Standard fail-closed fallback hook for the MCTS loop.
    return NextResponse.json(
      {
        status: 'error',
        fallbackToSyntactic: true,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
