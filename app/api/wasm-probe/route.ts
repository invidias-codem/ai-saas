import { NextResponse } from 'next/server';

/**
 * @route GET /api/wasm-probe
 * @description Minimal staging probe for onnxruntime-web WASM footprint
 * and cold-start latency under Vercel serverless constraints.
 *
 * Feature-gated: only runs when ENABLE_JEPA=true.
 * No production path touches this route unless explicitly invoked.
 */

export const dynamic = 'force-dynamic';

const PROBE_FEATURE_FLAG = process.env.ENABLE_JEPA === 'true';

/**
 * Minimal valid ONNX model: Identity(x) with float32 inputs/outputs, shape [1,3].
 * Generated as base64 to avoid committing binary artifacts.
 */
const MINIMAL_ONNX_B64 = 'OkgIAQgSBQoAEAESOjwKBG1haW4iEAoISWRlbnRpdHkSAXgaAXkSEAoBeBILCAEBEgYIAQEIAQMSEAoBeRILCAEBEgYIAQEIAQM=';

function decodeMinimalModel(): ArrayBuffer {
  const binary = Buffer.from(MINIMAL_ONNX_B64, 'base64');
  const buf = new ArrayBuffer(binary.length);
  new Uint8Array(buf).set(binary);
  return buf;
}

export async function GET() {
  if (!PROBE_FEATURE_FLAG) {
    return NextResponse.json(
      { error: 'JEPA probe disabled', flag: false },
      { status: 404 }
    );
  }

  const started = Date.now();
  const results: Record<string, unknown> = {
    flag: true,
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL || 'false',
    timestamp: new Date().toISOString(),
  };

  try {
    const [ort] = await Promise.all([
      import('onnxruntime-web/wasm'),
    ]);

    (ort as any).env.wasm.numThreads = 1;
    const wasmDir = `${process.cwd()}/public/wasm`;
    (ort as any).env.wasm.wasmPaths = {
      wasm: `file://${wasmDir}/ort-wasm-simd-threaded.wasm`,
      mjs: `file://${wasmDir}/ort-wasm-simd-threaded.mjs`,
    };

    results.ortLoaded = true;
    results.ortVersion = (ort as any).version || 'unknown';

    const session = await (ort as any).InferenceSession.create(
      decodeMinimalModel(),
      {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        wasmPaths: '/wasm/',
      }
    );

    results.wasmLocated = true;
    results.sessionCreated = true;

    // Run a no-op inference to measure cold-start latency.
    const feeds: Record<string, any> = {
      input: new (ort as any).Tensor(
        'float32',
        new Float32Array([1, 2, 3]),
        [1, 3]
      ),
    };

    const inferenceStarted = Date.now();
    const output = await session.run(feeds);
    const inferenceMs = Date.now() - inferenceStarted;

    results.inferenceMs = inferenceMs;
    results.outputShape = output.output?.dims || null;
    results.outputDtype = output.output?.type || null;

    session.release();

    const totalMs = Date.now() - started;
    results.totalMs = totalMs;
    results.killCriteria = {
      uncompressedBundleTarget: '<150 MB',
      p95ColdStartTarget: '<600 ms',
      verdict:
        totalMs < 600
          ? 'PASS — cold-start within budget'
          : 'FAIL — exceeds 600ms kill threshold',
    };

    return NextResponse.json(results, {
      headers: {
        'X-Probe-Duration-Ms': String(totalMs),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    const totalMs = Date.now() - started;
    results.totalMs = totalMs;
    results.error = error?.message || String(error);
    results.stack =
      process.env.NODE_ENV !== 'production'
        ? error?.stack
        : undefined;
    results.killCriteria = {
      verdict: 'FAIL — WASM load or inference error',
      error: results.error,
    };

    return NextResponse.json(results, {
      status: 500,
      headers: {
        'X-Probe-Duration-Ms': String(totalMs),
        'Cache-Control': 'no-store',
      },
    });
  }
}
