// app/api/demo/client-ops/uncertainty/route.ts
// C1 protected demo UI — Uncertainty review screen.
// Feature-gated (ENABLE_CLIENT_OPS_DEMO), owner-only, synthetic-only.
import { NextResponse } from 'next/server';
import { requireDemoAccess, demoAccessErrorResponse } from '@/lib/pilots/clientOps/demoAuth';
import { getDemoData } from '@/lib/pilots/clientOps/demoServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    await requireDemoAccess(workspaceId);

    const { result } = getDemoData();
    return NextResponse.json({
      engagementId: result.engagementId,
      uncertainItems: result.determinations
        .filter((d) => d.status === 'uncertain')
        .map((d) => ({
          itemId: d.itemId,
          matchCount: d.matchCount,
          confidence: d.confidence,
          uncertaintyReason: d.uncertaintyReason,
          evidenceIds: d.evidenceIds,
        })),
      uncertainCount: result.metrics.uncertainCount,
    });
  } catch (error) {
    return demoAccessErrorResponse(error);
  }
}
