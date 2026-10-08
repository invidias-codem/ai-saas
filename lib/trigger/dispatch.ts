import { tasks } from "@trigger.dev/sdk";
import { env } from "@/lib/env";

export async function dispatchCodeBuilderToTrigger(args: {
  buildId: string;
  requestId: string;
  userId: string;
  workspaceId?: string;
  prompt: string;
  mode: "fast" | "full";
  installedDependencies?: string[];
}): Promise<string | null> {
  if (!env.TRIGGER_SECRET_KEY) return null;
  try {
    const handle = await tasks.trigger("code-builder-orchestrator", args);
    return handle.id ?? null;
  } catch (err) {
    console.warn("[Trigger.dev] code-builder-orchestrator dispatch failed:", err);
    return null;
  }
}

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

/**
 * A3: durable acquisition ingestion dispatch.
 *
 * Idempotency: Trigger's idempotencyKey = the acquisition operationKey, so
 * duplicate Apify webhooks collapse into ONE logical task execution. The DB
 * atomic claim (claimIngestion) is the authoritative backstop — Trigger is
 * the execution optimization, never the dedupe of record.
 *
 * Payload carries durable identities ONLY — no dataset contents, no actor
 * input, no user prompt, no credentials. The worker reconstructs everything
 * from the store + provider API.
 */
export async function dispatchAcquisitionIngest(args: {
  acquisitionRequestId: string;
  provider: "apify";
  providerRunId: string;
  operationKey: string;
}): Promise<{ triggerRunId: string | null } | null> {
  if (!env.TRIGGER_SECRET_KEY) return null;
  try {
    const handle = await tasks.trigger(
      "acquisition-ingest",
      {
        acquisitionRequestId: args.acquisitionRequestId,
        provider: args.provider,
        providerRunId: args.providerRunId,
        operationKey: args.operationKey,
      },
      { idempotencyKey: args.operationKey },
    );
    return { triggerRunId: handle.id ?? null };
  } catch (err) {
    console.warn("[Trigger.dev] acquisition-ingest dispatch failed:", err);
    return null;
  }
}