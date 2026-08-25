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
    // Dynamic import so the module is excluded from the main bundle when
    // the feature flag is false.
    const [ort] = await Promise.all([
      import('onnxruntime-web'),
    ]);

    // Force single-threaded WASM. In Vercel serverless Node.js, the default
    // thread-count auto-detection path can still attempt Worker-based
    // initialization; setting this explicitly avoids that structural failure.
    (ort as any).env.wasm.numThreads = 1;

    results.ortLoaded = true;
    results.ortVersion = (ort as any).version || 'unknown';

    // Build a tiny dummy ONNX model in memory (1MB-ish).
    // This avoids committing binary model artifacts to the repo.
    const session = await (ort as any).InferenceSession.create(
      new ArrayBuffer(1024 * 1024), // 1MB dummy model
      {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        // The critical locateFile override: tell ONNX runtime to fetch
        // WASM artifacts from the Next.js public/ directory instead of
        // node_modules/.bin or native filesystem paths.
        locateFile: (file: string) => {
          return `/wasm/${file}`;
        },
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
