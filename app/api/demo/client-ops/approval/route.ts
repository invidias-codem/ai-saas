// app/api/demo/client-ops/approval/route.ts
// C1 protected demo UI — Follow-up draft approval screen.
// Feature-gated (ENABLE_CLIENT_OPS_DEMO), owner-only, synthetic-only.
// The draft is read-only display only — no send/dispatch/mutate capability exists.
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

    const { result, proposal } = getDemoData();
    return NextResponse.json({
      engagementId: proposal.engagementId,
      followUpDraft: {
        subject: proposal.followUpDraft.subject,
        body: proposal.followUpDraft.body,
        actionItems: proposal.followUpDraft.actionItems,
        tone: proposal.followUpDraft.tone,
        generatedAt: proposal.followUpDraft.generatedAt,
        // Explicitly absent: no send, dispatch, or mutate methods
      },
      requiresHumanVerification: proposal.requiresHumanVerification,
      flaggedForReview: proposal.flaggedForReview,
      summary: proposal.summary,
      notice:
        'This is a review-only draft. No message has been sent. No external system has been contacted.',
    });
  } catch (error) {
    return demoAccessErrorResponse(error);
  }
}
