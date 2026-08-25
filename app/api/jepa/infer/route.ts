import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JEPA_FALLBACK_ENABLED = process.env.JEPA_FALLBACK === 'true';

// Module-level session cache and initialization lock for warm-start amortization.
let cachedSession: ort.InferenceSession | null = null;
let initializationPromise: Promise<ort.InferenceSession> | null = null;

function astTokenToIds(astTokens: string, maxLen = 128): number[] {
  // Deterministic, model-free encoding: split tokens and hash each into [0, 65535].
  const ids = astTokens.split(/[()\s]+/).filter(Boolean).map((tok) => {
    let h = 0;
    for (let i = 0; i < tok.length; i++) {
      h = ((h << 5) - h + tok.charCodeAt(i)) | 0;
    }
    return ((Math.abs(h) % 65535) + 65535) % 65535;
  });

  // Truncate or pad to the model's expected input length.
  if (ids.length > maxLen) return ids.slice(0, maxLen);
  while (ids.length < maxLen) ids.push(0);
  return ids;
}

async function getJepaSession(): Promise<ort.InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    ort.env.wasm.numThreads = 1;

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
    const astTokens = typeof body.astTokens === 'string' ? body.astTokens : '';
    const language = typeof body.language === 'string' ? body.language : 'unknown';

    const session = await getJepaSession();
    const inputIds = astTokenToIds(astTokens, 128);
    const inputTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map((v) => BigInt(v))), [1, 128]);
    const results = await session.run({ input: inputTensor });

    const output = results.output;
    const embedding = Array.isArray(output?.data)
      ? (output.data as unknown as number[]).slice(0, 128)
      : null;

    return NextResponse.json({
      status: 'success',
      embedding,
      astTokens,
      language,
      totalMs: Date.now() - started,
      warmStart: !!cachedSession,
    });
  } catch (error: any) {
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
