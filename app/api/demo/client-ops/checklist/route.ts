// app/api/demo/client-ops/checklist/route.ts
// C1 protected demo UI — Document checklist screen.
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
      items: result.determinations.map((d) => ({
        itemId: d.itemId,
        status: d.status,
        confidence: d.confidence,
        matchCount: d.matchCount,
        evidenceCount: d.evidenceIds.length,
        uncertaintyReason: d.uncertaintyReason,
      })),
      metrics: {
        totalItems: result.metrics.totalItems,
        receivedCount: result.metrics.receivedCount,
        missingCount: result.metrics.missingCount,
        uncertainCount: result.metrics.uncertainCount,
        requiredCompleteness: result.metrics.requiredCompleteness,
      },
    });
  } catch (error) {
    return demoAccessErrorResponse(error);
  }
}
