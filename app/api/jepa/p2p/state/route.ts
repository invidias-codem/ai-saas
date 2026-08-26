import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Module-level variance spike state written by the PM2 DP variance watchdog
// and read by the GossipSub transport layer.
let hasVarianceSpike = false;

export interface VarianceSpikeState {
  hasVarianceSpike: boolean;
  updatedAt: number;
}

// GET: transport layer polls this to apply dynamic heartbeat changes.
export async function GET() {
  const state: VarianceSpikeState = {
    hasVarianceSpike,
    updatedAt: Date.now(),
  };
  return NextResponse.json(state);
}

// POST: PM2 variance watchdog writes state changes here.
// Accepts optional JSON body; missing body keeps current state unchanged.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.hasVarianceSpike === 'boolean') {
      hasVarianceSpike = body.hasVarianceSpike;
    }
    return NextResponse.json({ ok: true, hasVarianceSpike });
  } catch {
    return NextResponse.json(
      { error: 'Invalid variance spike payload' },
      { status: 400 }
    );
  }
}
