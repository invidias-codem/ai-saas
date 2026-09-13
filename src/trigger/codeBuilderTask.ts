import { task } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * Durable Code Builder orchestrator root task (Phase 2).
 *
 * Wraps the canonical `runCodeBuilder` engine (lib/ucol/codeBuilderEngine.ts)
 * so the entire plan → generate → review lifecycle runs OUTSIDE the Next.js
 * serverless 300s timeout, in Trigger.dev's cloud runtime (maxDuration 900s).
 *
 * This is NOT a second engine — it is another durable CALLER of the same
 * runCodeBuilder() the SSE path already uses. UCOL stays the orchestration/
 * policy brain; Trigger only owns durable execution.
 *
 * Cancellation semantics: an AbortSignal cannot be serialized across the
 * Trigger boundary (it's a live DOM/undici object). The task therefore runs
 * progress callbacks as no-ops and does not expose cancellation; cancellation
 * of a durable build is a future concern (Trigger run cancellation + a persisted
 * build status the engine checks between phases). Documented, not implemented.
 *
 * Operation identity: buildId is the stable logical-build identity (created by
 * the API, deterministic across retries). triggerRunId is the durable-execution
 * identity (Trigger's own run id) and is NEVER the business identity. A retried
 * task with the same buildId must not create a duplicate logical build — see
 * payload schema (buildId required, provided by the caller, not generated here).
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

    // Reconstruct a BuildSession on the worker from the serializable payload —
    // never deserialize live session state. This is the SAME reconstruction a
    // future durable worker will do once build state is persisted (Phase 3).
    const session = makeBuildSession({
      buildId: payload.buildId,
      requestId: payload.requestId,
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      userPrompt: payload.prompt,
    });

    // Progress callback: no-op on the worker. The SSE route owns event fan-out;
    // Trigger Realtime (Phase 7) will replace this with a real stream.
    const emit = () => {};

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

    return {
      status: "success",
      buildId: payload.buildId,
      appName: result.plan.appName,
      componentCount: result.plan.components.length,
      fileCount: result.files.length,
      files: result.files.map((f) => ({ path: f.path, language: f.language })),
    };
  },
});