import { task, tasks } from "@trigger.dev/sdk";
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
  // Task-level runaway guard; overrides the project-wide 900s default.
  // 12-component builds at ~137s/LLM call × ~25 calls ≈ 57 min — 60 min is
  // deliberately not the target, just the kill switch. Algorithmic fixes
  // (DAG fan-out) live in Phase 4+.
  maxDuration: 3600,
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
      // The API route already called markBuildRunning with the trigger_run_id.
      // We do NOT call markBuildRunning here — it would overwrite the correlation.
      await store.createBuild({
        buildId: payload.buildId,
        userId: payload.userId,
        workspaceId: payload.workspaceId,
        requestId: payload.requestId,
        mode: payload.mode,
        prompt: payload.prompt,
      });

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

// SDK 4.5.16: `tasks.onFailure(fn)` registers a project-global hook; the params'
// `task: string` is the ONLY scoping mechanism available (the value export of
// the standalone `onFailure` is type-only in this version). Guard on it.
// Per Trigger docs, crashed/system-failure/cancelled statuses BYPASS this
// hook — a reconciliation pass (Phase 4+) is the durable answer for those.
// This hook closes the "worker died but left the row stuck RUNNING" hole for
// the failure paths Trigger does report.
tasks.onFailure(async ({ payload, task, error }) => {
  if (task !== "code-builder-orchestrator") return;
  const parsed = codeBuilderPayloadSchema.safeParse(payload);
  if (!parsed.success) return;
  try {
    const store = await import("@/lib/code-builder/buildStore");
    const msg = error instanceof Error ? error.message : String(error ?? "unknown");
    await store.failBuild(parsed.data.buildId, "WORKER_TERMINATED", msg);
  } catch (hookErr) {
    console.error("[code-builder onFailure] failBuild failed:", hookErr);
  }
});
