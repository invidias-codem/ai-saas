// app/api/code-builder/build/route.ts
// Durable Code Builder entry point (Phase 2).
//
// Auth → create buildId → dispatch code-builder-orchestrator (Trigger) → return
// { buildId, runId } immediately. The existing /api/code-builder/stream SSE
// route is UNCHANGED and remains the production path.
//
// This route is a thin boundary: it owns identity (buildId) and durable
// dispatch; the engine (runCodeBuilder) owns the actual build. auth() supplies
// userId/workspaceId; buildId is created here ONCE and handed to the task so a
// Trigger retry reuses the same logical build (no duplicate builds).

import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { z } from 'zod';
import { dispatchCodeBuilderToTrigger } from '@/lib/trigger/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BuildRequestSchema = z.object({
  prompt: z.string().min(1).max(5000),
  mode: z.enum(['fast', 'full']).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = BuildRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Validation Error', details: parsed.error.flatten() }, { status: 400 });
    }

    const { prompt, mode = 'full' } = parsed.data;

    // Deterministic build identity, created here (not in the task) so retries
    // of the durable run never mint a second logical build.
    const buildId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const runId = await dispatchCodeBuilderToTrigger({
      buildId,
      requestId,
      userId: user.userId,
      prompt,
      mode,
    });

    if (!runId) {
      // Trigger unprovisioned or dispatch failed. Surface clearly rather than
      // silently returning a build that will never run.
      return Response.json(
        { error: 'Durable execution is not configured (TRIGGER_SECRET_KEY missing) or dispatch failed' },
        { status: 503 }
      );
    }

    return Response.json({ buildId, runId, mode });
  } catch (error: any) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[UCOL:Build] dispatch error:', error);
    return Response.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}