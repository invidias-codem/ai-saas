import { task } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * Durable Code Builder orchestrator root task (Phase 2 → Phase 3).
 *
 * Wraps the canonical `runCodeBuilder` engine (lib/ucol/codeBuilderEngine.ts)
 * so the entire plan → generate → review lifecycle runs OUTSIDE the Next.js
 * serverless 300s timeout, in Trigger.dev's cloud runtime (maxDuration 900s).
 *
 * Phase 3: the task now persists its lifecycle to the durable build store
 * (lib/code-builder/buildStore.ts) — QUEUED→RUNNING→phase→terminal — so "where
 * is this build right now?" is answerable independent of the SSE stream or the
 * worker process. It does NOT persist individual BuilderEvents (that's Phase 4).
 *
 * Cancellation: an AbortSignal cannot serialize across the Trigger boundary;
 * the task runs a no-op emit. Durable cancellation is a future concern.
 *
 * Identity: build_id (business identity, from the API) is stable; trigger run id
 * is execution identity and may change on retry. The store upserts on build_id,
 * so a retry NEVER mints a second logical build.
 */

export const codeBuilderPayloadSchema = z.object({
  buildId: z.string().min(1),
  requestId: z.string().min(1),
  userId: z.string(),
  workspaceId: z.string().optional(),
  prompt: z.string().min(1),
  mode: z.enum(["fast", "full"]).default("full"),
  installedDependencies: z.array(z.string()).optional(),
});

export const codeBuilderTask = task({
  id: "code-builder-orchestrator",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: z.infer<typeof codeBuilderPayloadSchema>) => {
    const { runCodeBuilder } = await import("@/lib/ucol/codeBuilderEngine");
    const { makeBuildSession } = await import("@/lib/ucol/buildSession");
    const store = await import("@/lib/code-builder/buildStore");

    // Note: the Trigger run id is NOT captured here (the SDK's `run` callback has
    // no context arg in 4.5.16). The API route owns the buildId↔triggerRunId
    // correlation at dispatch time (tasks.trigger returns a RunHandle with `.id`).
    // trigger_run_id is therefore set on the build row by the API, not the worker.

    try {
      // QUEUED (written by the API) → RUNNING. Upsert-safe on build_id: a retry
      // never mints a second logical build.
      await store.createBuild({
        buildId: payload.buildId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
        requestId: payload.requestId,
        mode: payload.mode,
        prompt: payload.prompt,
      });
      await store.markBuildRunning(payload.buildId, "");

      const session = makeBuildSession({
        buildId: payload.buildId,
        requestId: payload.requestId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
        userPrompt: payload.prompt,
      });

      // No-op emit on the worker; SSE owns event fan-out (Realtime in Phase 7).
      const emit = () => {};

      await store.updateBuildPhase(payload.buildId, "planning", 10);

      const result = await runCodeBuilder({
        buildId: payload.buildId,
        requestId: payload.requestId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
        prompt: payload.prompt,
        mode: payload.mode,
        emit,
        installedDependencies: payload.installedDependencies ?? [],
        session,
      });

      await store.completeBuild(payload.buildId);

      return {
        status: "success",
        buildId: payload.buildId,
        appName: result.plan.appName,
        componentCount: result.plan.components.length,
        fileCount: result.files.length,
        files: result.files.map((f) => ({ path: f.path, language: f.language })),
      };
    } catch (err: any) {
      // Terminal failure, sanitized by the store (strips secrets/stack dumps).
      await store.failBuild(payload.buildId, "BUILD_FAILED", String(err?.message ?? err)).catch(() => {});
      throw err;
    }
  },
});