// app/api/demo/client-ops/route.ts
// C1 protected demo UI — Engagement overview screen.
// Feature-gated (ENABLE_CLIENT_OPS_DEMO), owner-only, synthetic-only.
// No external effects, no real customer data.
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
      tenantId: result.tenantId,
      workspaceId: result.workspaceId,
      evaluatedAt: result.evaluatedAt,
      evaluatorVersion: result.evaluatorVersion,
      metrics: result.metrics,
      status: 'synthetic-demo',
    });
  } catch (error) {
    return demoAccessErrorResponse(error);
  }
}
