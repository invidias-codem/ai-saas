// app/api/demo/client-ops/evidence/route.ts
// C1 protected demo UI — Cited evidence screen.
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
      evidence: result.citedEvidence.map((s) => ({
        evidenceId: s.evidenceId,
        description: s.description,
        charStart: s.charStart,
        charEnd: s.charEnd,
        contentHash: s.contentHash,
      })),
      evidenceSpanCount: result.metrics.evidenceSpanCount,
    });
  } catch (error) {
    return demoAccessErrorResponse(error);
  }
}
