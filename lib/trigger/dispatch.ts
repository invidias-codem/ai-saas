import { tasks } from "@trigger.dev/sdk";
import { env } from "@/lib/env";

/**
 * Fire-and-forget Trigger.dev dispatch helper.
 *
 * Offloads the long-running agentic ReAct loop to the durable `agent-loop`
 * task when (and only when) Trigger.dev is configured. NON-BLOCKING and
 * env-gated so it is inert in local dev / before the platform is wired.
 *
 * Returns the run id, or `null` when not configured (caller continues with the
 * inline execution path).
 *
 * NOTE: the task id must match the `id` field passed to `task({ id: ... })` in
 * src/trigger/agentLoopTask.ts — Trigger.dev resolves by id, not by import.
 */
export async function dispatchAgentLoopToTrigger(args: {
  userId: string;
  workspaceId: string;
  conversationId?: string;
  userQuery: string;
  modelName: string;
  mode: "agentic";
}): Promise<string | null> {
  if (!env.TRIGGER_SECRET_KEY) return null;
  try {
    const handle = await tasks.trigger("agent-loop", args);
    return handle.id ?? null;
  } catch (err) {
    console.warn("[Trigger.dev] agent-loop dispatch failed (falling back inline):", err);
    return null;
  }
}