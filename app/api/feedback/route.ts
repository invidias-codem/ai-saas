import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { supabaseAdmin } from "@/lib/supabaseClient";
import { scrubObject, scrubText } from "@/lib/security/pii";
import { limitFeedback } from "@/lib/security/rateLimit";

/**
 * Feedback ingestion payload schema.
 *
 * This route is intentionally permissive (anonymous allowed) to support early product usage.
 * All writes are performed using the Supabase Service Role key via `supabaseAdmin`.
 *
 * Suggested conventions:
 * - rating: -1 (bad), 0 (neutral), +1 (good) or a 1-5 scale (pick one and standardize later)
 * - labels: short taxonomy strings like "hallucination", "missing_context", "wrong_tool_use"
 * - metadata: arbitrary JSON for tracing (latencyMs, traceId, toolCalls, etc.)
 */
export const FeedbackSchema = z.object({
  sessionId: z.string().optional(),
  source: z.string().optional(), // e.g. 'web' | 'slack' | 'api'

  conversationId: z.string().optional(),
  messageId: z.string().optional(),

  promptVersion: z.string().optional(),
  model: z.string().optional(),

  input: z.string().optional(),
  output: z.string().optional(),

  rating: z.number().int().optional(),
  feedbackText: z.string().optional(),

  labels: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),

  retrievalContextIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 }
    );
  }

  // Anonymous is allowed; userId will be null.
  // In environments where Clerk isn't configured, auth() may throw; treat as anonymous.
  let userId: string | null = null;
  try {
    const a = await auth();
    userId = a.userId ?? null;
  } catch {
    userId = null;
  }

  const p = parsed.data;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const identifier = userId ?? ip ?? p.sessionId ?? "anonymous";

  // Rate limit early to protect the DB.
  try {
    const rl = await limitFeedback(identifier, Boolean(userId));
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded", reset: rl.reset },
        { status: 429 }
      );
    }
  } catch (e: any) {
    // If the rate limiter is misconfigured (missing env vars), we fail open to avoid breaking prod.
    // This should be tightened once Upstash is deployed everywhere.
    console.warn("[FEEDBACK] Rate limiter unavailable:", e?.message ?? e);
  }

  const scrubbedInput = p.input ? scrubText(p.input) : null;
  const scrubbedOutput = p.output ? scrubText(p.output) : null;
  const scrubbedFeedbackText = p.feedbackText ? scrubText(p.feedbackText) : null;
  const scrubbedMetadata = p.metadata ? (scrubObject(p.metadata) as Record<string, unknown>) : {};

  const { data, error } = await supabaseAdmin
    .from("feedback_events")
    .insert({
      user_id: userId,
      session_id: p.sessionId ?? null,
      source: p.source ?? "web",

      conversation_id: p.conversationId ?? null,
      message_id: p.messageId ?? null,

      prompt_version: p.promptVersion ?? null,
      model: p.model ?? null,

      input: scrubbedInput,
      output: scrubbedOutput,

      rating: p.rating ?? null,
      feedback_text: scrubbedFeedbackText,

      labels: p.labels ?? [],
      metadata: scrubbedMetadata,
      retrieval_context_ids: p.retrievalContextIds ?? [],
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to store feedback", details: error },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
