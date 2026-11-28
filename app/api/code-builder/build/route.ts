// app/api/code-builder/build/route.ts
// Durable Code Builder entry point (Phase 2 → Phase 3).
//
// Auth → create buildId → persist QUEUED (buildStore) → dispatch Trigger →
// record trigger_run_id → return { buildId, runId }. The existing
// /api/code-builder/stream SSE route is UNCHANGED and remains production.
//
// Identity: buildId (business identity) is created here once; triggerRunId
// (execution identity) is captured from the dispatch RunHandle. A retry/replay
// upserts the same buildId — never a second logical build.

import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { z } from 'zod';
import { dispatchCodeBuilderToTrigger } from '@/lib/trigger/dispatch';
import { createBuild, markBuildRunning } from '@/lib/code-builder/buildStore';

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

    // Persist QUEUED before dispatch so the build row exists regardless of
    // whether the worker ever starts (a failed dispatch still has a record).
    await createBuild({ buildId, userId: user.userId, requestId, mode, prompt });

    const runId = await dispatchCodeBuilderToTrigger({
      buildId,
      requestId,
      userId: user.userId,
      prompt,
      mode,
    });

    if (!runId) {
      // Trigger unprovisioned or dispatch failed. The build row stays QUEUED so
      // it is reconcilable; surface clearly rather than a build that will never run.
      return Response.json(
        { error: 'Durable execution is not configured (TRIGGER_SECRET_KEY missing) or dispatch failed', buildId },
        { status: 503 }
      );
    }

    // Correlate execution identity (runId) to the build — NOT the build identity.
    await markBuildRunning(buildId, runId);

    return Response.json({ buildId, runId, mode });
  } catch (error: any) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[UCOL:Build] dispatch error:', error);
    return Response.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}