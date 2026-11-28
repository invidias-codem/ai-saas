import { NextResponse } from 'next/server';
import { requireAuth, AuthenticationError, AuthorizationError, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getWorkspaceAccess } from '@/lib/security/workspaceAccess';
import { approveDurable, rejectDurable, getDurableApproval, type DurableApprovalRecord } from '@/lib/execution/durableApprovalStore';
import { resolveAgenticTool } from '@/lib/agents/core/agenticToolSet';
import { hasMediaEnvelope, type MediaEnvelope } from '@/lib/media/envelope';
import { z } from 'zod';

const decisionSchema = z.object({ approvalId: z.string().trim().min(1).max(256), approved: z.boolean() });
const unavailable = () => NextResponse.json({ error: 'Approval not found or unavailable' }, { status: 404 });

async function currentScope(row: DurableApprovalRecord, userId: string): Promise<boolean> {
  if (row.userId !== userId || row.context?.userId !== userId ||
      (row.context?.workspaceId ?? null) !== row.workspaceId ||
      !Number.isFinite(Date.parse(row.expiresAt)) || Date.parse(row.expiresAt) <= Date.now()) return false;
  if (row.workspaceId) {
    // Conservative interim policy. Shared delegated mutation is not qualified.
    const access = await getWorkspaceAccess(userId, row.workspaceId);
    if (access?.role !== 'owner') return false;
  }
  return true;
}

export async function POST(req: Request) {
  try {
    const { userId } = await requireAuth();
    const rate = await limitApiEndpoint(userId, getClientIP(req), 'mutation');
    if (!rate.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Explicit approval decision required' }, { status: 400 });
    const { approvalId, approved } = parsed.data;
    const row = await getDurableApproval(approvalId, userId);
    if (!row || !await currentScope(row, userId)) return unavailable();
    if (row.status !== 'PENDING') return NextResponse.json({ error: 'Approval already resolved' }, { status: 409 });
    if (!approved) {
      const rejected = await rejectDurable(approvalId, userId);
      return rejected ? NextResponse.json({ success: true, approved: false }) :
        NextResponse.json({ error: 'Approval no longer pending' }, { status: 409 });
    }

    // A persisted context is not a fresh admin/org grant or sandbox admission.
    const tool = resolveAgenticTool(row.toolName);
    if (!tool || tool.requiresSandbox || row.context.userRole === 'admin' || row.context.orgContext) {
      return NextResponse.json({ error: 'Approval requires a qualified execution path' }, { status: 403 });
    }
    const validation = tool.schema.safeParse(row.input);
    if (!validation.success) return NextResponse.json({ error: 'Invalid tool input' }, { status: 400 });
    const claimed = await approveDurable(approvalId, userId);
    if (!claimed) return NextResponse.json({ error: 'Approval no longer pending' }, { status: 409 });
    // Check again after the claim. Do not execute against stale or changed context.
    if (!await currentScope(claimed, userId) || claimed.toolName !== row.toolName ||
        claimed.workspaceId !== row.workspaceId || claimed.context.userRole === 'admin' ||
        claimed.context.orgContext || JSON.stringify(claimed.input) !== JSON.stringify(row.input)) {
      return NextResponse.json({ error: 'Approval authority changed; new approval required' }, { status: 409 });
    }
    const result = await tool.execute(validation.data, {
      userId, sessionId: claimed.context.sessionId, workspaceId: claimed.workspaceId,
      userRole: 'user', history: claimed.context.history, enableTelemetry: claimed.context.enableTelemetry,
    });
    const media = hasMediaEnvelope(result) ? (result._media as MediaEnvelope) : null;
    return NextResponse.json({ success: true, approved: true, result, media });
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return handleAuthError(error);
    // A consumed approval is not proof of successful external execution; do not retry blindly.
    return NextResponse.json({ error: 'Approval resume unavailable; reconcile before retrying' }, { status: 503 });
  }
}
