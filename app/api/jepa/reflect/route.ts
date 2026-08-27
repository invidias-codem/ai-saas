import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LATENT_DIM = 128;
const REFLECTION_WARM_START_BUDGET_MS = 500;
const REFLECTION_COLD_START_BUDGET_MS = 5000;

let cachedReflectionSession: ort.InferenceSession | null = null;
let reflectionInitializationPromise: Promise<ort.InferenceSession> | null = null;

async function getReflectionSession(): Promise<ort.InferenceSession> {
  if (cachedReflectionSession) {
    return cachedReflectionSession;
  }

  if (reflectionInitializationPromise) {
    return reflectionInitializationPromise;
  }

  reflectionInitializationPromise = (async () => {
    ort.env.wasm.numThreads = 1;

    const wasmDir = `${process.cwd()}/public/wasm`;
    ort.env.wasm.wasmPaths = {
      wasm: `file://${wasmDir}/ort-wasm-simd-threaded.wasm`,
      mjs: `file://${wasmDir}/ort-wasm-simd-threaded.mjs`,
    };

    const modelPath = `${wasmDir}/reflection_expert.onnx`;
    const modelBuffer = require('node:fs').readFileSync(modelPath);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    cachedReflectionSession = session;
    return session;
  })();

  return reflectionInitializationPromise;
}

function toFloat32Array(input: number[] | null | undefined): Float32Array {
  const arr = new Float32Array(LATENT_DIM);
  if (!input) return arr;
  for (let i = 0; i < Math.min(input.length, LATENT_DIM); i++) {
    arr[i] = Number(input[i]);
  }
  return arr;
}

export async function POST(request: NextRequest) {
  const started = Date.now();

  try {
    const body = await request.json();
    const zStuck = Array.isArray(body.z_stuck) ? body.z_stuck : null;
    const zContext = Array.isArray(body.z_context) ? body.z_context : null;

    if (!zStuck || zStuck.length === 0) {
      return NextResponse.json(
        { error: 'Missing z_stuck in payload' },
        { status: 400 }
      );
    }

    const session = await getReflectionSession();
    const stuckTensor = toFloat32Array(zStuck);
    const contextTensor = toFloat32Array(zContext ?? zStuck);

    const results = await session.run({
      z_stuck: new ort.Tensor('float32', stuckTensor, [1, LATENT_DIM]),
      z_context: new ort.Tensor('float32', contextTensor, [1, LATENT_DIM]),
    });

    const zPast = results.z_past;
    const zHyperFuture = results.z_hyper_future;

    if (!zPast || !zHyperFuture) {
      return NextResponse.json(
        {
          status: 'error',
          fallbackToSyntactic: true,
          error: 'reflection_expert.onnx missing expected outputs',
        },
        { status: 500 }
      );
    }

    const totalMs = Date.now() - started;
    const isWarmStart = !!cachedReflectionSession;
    const latencyBudget = isWarmStart
      ? REFLECTION_WARM_START_BUDGET_MS
      : REFLECTION_COLD_START_BUDGET_MS;

    const latencyExceeded = isWarmStart && totalMs > latencyBudget;

    return NextResponse.json({
      status: 'success',
      z_past: Array.from(zPast.data as Float32Array),
      z_hyper_future: Array.from(zHyperFuture.data as Float32Array),
      totalMs,
      warmStart: isWarmStart,
      latencyExceeded,
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

