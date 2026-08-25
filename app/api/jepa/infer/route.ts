import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JEPA_WORKER_URL = process.env.JEPA_WORKER_URL;
const JEPA_FALLBACK_ENABLED = process.env.JEPA_FALLBACK === 'true';

export async function POST(request: Request) {
  if (!JEPA_FALLBACK_ENABLED || !JEPA_WORKER_URL) {
    return NextResponse.json(
      { error: 'JEPA fallback not configured' },
      { status: 501 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.JEPA_API_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const started = Date.now();

  try {
    const resp = await fetch(JEPA_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });

    if (!resp.ok) {
      throw new Error(`Worker responded ${resp.status}: ${resp.statusText}`);
    }

    const result = await resp.json();
    return NextResponse.json({
      ...result,
      fallback: true,
      workerLatencyMs: Date.now() - started,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'JEPA worker unavailable',
        message: error.message,
        fallback: true,
      },
      { status: 502 }
    );
  }
}
