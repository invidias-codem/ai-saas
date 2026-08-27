/**
 * app/api/jepa/reflect/route.ts
 *
 * Reflection expert endpoint: runs the BiJEPA backward predictor and
 * H-JEPA hyperbolic predictor against reflection_expert.onnx.
 *
 * Design constraints:
 *  - NOT on the fast-path. This route intentionally exceeds the 15 ms
 *    fast-path budget because it includes Supabase I/O + ONNX inference.
 *  - Uses onnxruntime-web with WASM execution provider, matching the
 *    existing /api/jepa/predict route for consistency.
 *  - Promise-based caching lock prevents thundering-herd session init.
 */

import * as ort from 'onnxruntime-web';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Session cache with promise-based locking
// ---------------------------------------------------------------------------

let cachedSession: ort.InferenceSession | null = null;
let initializationPromise: Promise<ort.InferenceSession> | null = null;

async function getReflectionSession(): Promise<ort.InferenceSession> {
  if (cachedSession) {
    return cachedSession;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    // Mirror the predictor route configuration exactly so behavior is consistent.
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

    cachedSession = session;
    return session;
  })();

  return initializationPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LATENT_DIM = 128;

function toFloat32Tensor(values: number[]): ort.Tensor {
  const data = new Float32Array(values);
  return new ort.Tensor('float32', data, [1, data.length]);
}

// ---------------------------------------------------------------------------
// POST /api/jepa/reflect
// ---------------------------------------------------------------------------

interface ReflectRequestBody {
  z_stuck: number[];
  z_context: number[];
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    const body = (await request.json()) as ReflectRequestBody;

    if (!Array.isArray(body.z_stuck) || body.z_stuck.length !== LATENT_DIM) {
      return NextResponse.json(
        { error: `z_stuck must be a ${LATENT_DIM}-d number array` },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.z_context) || body.z_context.length !== LATENT_DIM) {
      return NextResponse.json(
        { error: `z_context must be a ${LATENT_DIM}-d number array` },
        { status: 400 },
      );
    }

    const session = await getReflectionSession();

    const zStuckTensor = toFloat32Tensor(body.z_stuck);
    const zContextTensor = toFloat32Tensor(body.z_context);

    const feeds: Record<string, ort.Tensor> = {
      z_stuck: zStuckTensor,
      z_context: zContextTensor,
    };

    const results = await session.run(feeds);
    const zPast = Array.from(results.z_past.data as Float32Array);
    const zHyperFuture = Array.from(results.z_hyper_future.data as Float32Array);

    if (zPast.length !== LATENT_DIM || zHyperFuture.length !== LATENT_DIM) {
      throw new Error(
        `Reflection output dimension mismatch: ${zPast.length}, ${zHyperFuture.length}`
      );
    }

    return NextResponse.json({
      z_past: zPast,
      z_hyper_future: zHyperFuture,
      latencyMs: Date.now() - started,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[jepa/reflect] error:', message);
    return NextResponse.json(
      { error: message || 'Reflection inference failed' },
      { status: 500 },
    );
  }
}
