import { task } from "@trigger.dev/sdk";
import { z } from "zod";

/**
 * Durable agent-loop task.
 *
 * Wraps the existing `runReActLoop` (lib/agents/core/reactLoop.ts) so the
 * multi-step ReAct loop — up to MAX_LOOPS iterations, each a full LLM call plus
 * tool executions — runs OUTSIDE the Next.js serverless timeout in Trigger.dev's
 * cloud runtime.
 *
 * The ReAct loop is a pure function over serializable inputs
 *   (userQuery, context, registry, modelName) -> ReActResult
 * so it's safe to re-hydrate here. The ToolRegistry is rebuilt on the worker
 * from stable module-level tool constants (NEVER serialized across the
 * boundary — live `Tool` objects carry runtime functions that don't survive
 * JSON transport).
 */

export const agentLoopPayloadSchema = z.object({
  userId: z.string(),
  workspaceId: z.string(),
  conversationId: z.string().optional(),
  userQuery: z.string(),
  modelName: z.string().default("gemini-2.5-flash"),
  mode: z.enum(["agentic"]).default("agentic"),
});

export const agentLoopTask = task({
  id: "agent-loop",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (payload: z.infer<typeof agentLoopPayloadSchema>) => {
    const { runReActLoop } = await import("@/lib/agents/core/reactLoop");
    const { buildAgenticRegistry } = await import("./_registry");
    const { getAgenticContext } = await import("./_context");

    // Rebuild the tool registry + context on the worker (stable module-level
    // constants), never deserialize live tool objects from the payload.
    const registry = await buildAgenticRegistry(payload.mode);
    const context = await getAgenticContext({
      userId: payload.userId,
      workspaceId: payload.workspaceId,
      conversationId: payload.conversationId,
    });

    const result = await runReActLoop(
      payload.userQuery,
      context,
      registry,
      payload.modelName,
    );

    return {
      status: result.status,
      answer: result.answer,
      trajectory: result.trajectory,
      approvalRequest: result.approvalRequest ?? null,
      promotionState: result.promotionState ?? null,
    };
  },
});