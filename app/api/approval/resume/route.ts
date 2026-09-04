// app/api/approval/resume/route.ts
// Resumes a human-in-the-loop tool approval: with `approved: true`, executes the
// paused tool (already user-approved, so the approval gate is bypassed) and
// returns its result; with `approved: false`, drops the pending tool.
import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from "@/lib/security/apiAuth";
import { takePausedTool, dropPausedTool } from "@/lib/agents/core/approvalStore";
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
      dropPausedTool(approvalId);
      return NextResponse.json({ success: true, approved: false });
    }

    const paused = takePausedTool(approvalId);
    if (!paused) {
      return NextResponse.json(
        { error: "Approval request not found or expired" },
        { status: 404 }
      );
    }

    // Ownership guard: the resuming user must be the one who initiated the pause.
    if (paused.context.userId !== user.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Re-run schema validation + execute the paused tool (approval already granted).
    const tool = paused.tool;
    const validation = tool.schema.safeParse(paused.input);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid tool input", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const result = await tool.execute(validation.data, paused.context);

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