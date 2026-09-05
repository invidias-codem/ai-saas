// app/api/approval/resume/route.ts
// Resumes a human-in-the-loop tool approval: with `approved: true`, re-hydrates
// the paused tool from the stable agentic tool set (by name), re-validates its
// input, and executes it (the action was already human-approved, so the
// approval gate is bypassed). With `approved: false`, the pending approval is
// dropped. Approvals are durable (Supabase-backed) so they survive serverless
// cold starts.
import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from "@/lib/security/apiAuth";
import { approveDurable, rejectDurable, getDurableApproval } from "@/lib/execution/durableApprovalStore";
import { resolveAgenticTool } from "@/lib/agents/core/agenticToolSet";
import { hasMediaEnvelope, MediaEnvelope } from "@/lib/media/envelope";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    getClientIP(req);

    const body = (await req.json()) as { approvalId?: string; approved?: boolean };
    const { approvalId, approved } = body;

    if (!approvalId) {
      return NextResponse.json({ error: "approvalId is required" }, { status: 400 });
    }

    if (approved === false) {
      // Denial: idempotently mark the pending approval REJECTED.
      await rejectDurable(approvalId);
      return NextResponse.json({ success: true, approved: false });
    }

    // Atomically claim the PENDING approval as APPROVED (null if already
    // resolved/expired) — this prevents double execution across instances.
    const claimed = await approveDurable(approvalId);
    if (!claimed) {
      // Fall back to a read in case the row exists but was already claimed,
      // so we can still distinguish a not-found from an already-resolved row.
      const existing = await getDurableApproval(approvalId);
      if (!existing) {
        return NextResponse.json(
          { error: "Approval request not found or expired" },
          { status: 404 }
        );
      }
      // Already resolved — treat as no-op success (idempotent resume).
      return NextResponse.json({ success: true, approved: true, alreadyResolved: true });
    }

    // Ownership guard: the resuming user must be the one who initiated the pause.
    if (claimed.userId !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Re-hydrate the tool from the stable agentic tool set by name.
    const tool = resolveAgenticTool(claimed.toolName);
    if (!tool) {
      logger.error(`[approval/resume] tool not found for resume: ${claimed.toolName}`);
      return NextResponse.json(
        { error: `Tool '${claimed.toolName}' is no longer available` },
        { status: 404 }
      );
    }

    // Re-run schema validation + execute the paused tool (approval already granted).
    const validation = tool.schema.safeParse(claimed.input);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid tool input", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const result = await tool.execute(validation.data, claimed.context as any);

    // If the tool produced a media envelope, surface it for inline rendering.
    const media = hasMediaEnvelope(result) ? (result._media as MediaEnvelope) : null;

    return NextResponse.json({ success: true, approved: true, result, media });
  } catch (error: any) {
    logger.error("[approval/resume] failed:", { error: error?.message });
    const handled = handleAuthError(error);
    if (handled) return handled;
    return NextResponse.json(
      { error: error?.message || "Failed to resume approval" },
      { status: 500 }
    );
  }
}