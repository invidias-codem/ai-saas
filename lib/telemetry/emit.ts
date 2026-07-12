/**
 * emit.ts — Phase 1 instrumentation helper for Sovereign AI Telemetry.
 *
 * Builds a UDIF 2.0 audit record from a completed inference and forwards it
 * to the active TelemetrySink (lib/telemetry/sink). This is the function the
 * Runtime Bridge / LLM engines call — they never touch IndexedDB/Supabase
 * directly.
 *
 * Non-blocking by design: telemetry must NEVER break the main response path.
 * Any failure is swallowed and logged at debug level.
 *
 * Note on persistence: server-side, getSink() resolves to a volatile
 * MemoryLedger (no IndexedDB in SSR). The sovereign client IndexedDB write
 * happens in Phase 2 (browser emitter / Service Worker). Phase 3 flushes the
 * buffered records to the dedicated telemetry Supabase instance.
 */

import { getSink } from "./sink";
import { newTrace } from "./trace";
import { buildAuditRecord } from "./sink";
import { resolveGovernance } from "./governance";
import type {
  UdifInteractionAudit,
  ContentMode,
  GovernanceState,
} from "./udif";

export interface EmitInteractionAuditInput {
  /** The initially requested model id (before confidence override / fallback). */
  requestedModelId: string;
  /** The model id actually used for generation (post override/fallback). */
  actualModelId: string;
  /** Serving provider id, e.g. "anthropic" | "openai" | "google" | "local". */
  systemProvider: string;
  /** Agent mode / surface role, e.g. "fast" | "quality" | "code". */
  agentName: string;
  /** Feature type, e.g. "chat" | "code". */
  agentRole: string;
  /** Credit cost of this interaction (joined from lib/subscription). */
  creditCost: number;
  /** Optional governance context role; when set, the resolver snapshot is attached. */
  contextRole?: string;
  /** Optional pre-built governance state (skips resolution). */
  governance?: GovernanceState;
  /** Optional pre-built trace context (a new one is generated if omitted). */
  traceContext?: UdifInteractionAudit["trace_context"];
  /** Workflow correlation id (fleet-wide). */
  macroWorkflowId?: string;
  /** Audit content mode (DECIDED 2026-07-12: hybrid, user-controlled). */
  contentMode?: ContentMode;
  /** Optional token usage once known. */
  usage?: { prompt_tokens: number; completion_tokens: number };
  /** Optional tool-action spans. */
  actions?: UdifInteractionAudit["ai_ledger"]["actions"];
}

/**
 * Construct and emit a UDIF 2.0 interaction-audit record.
 * Resolves governance when a contextRole is supplied, then forwards the record
 * to the active sink. Returns the record (for callers that forward it to the
 * client), or null on failure. Never throws. Async because governance
 * resolution may hit Supabase.
 */
export async function emitInteractionAudit(
  input: EmitInteractionAuditInput
): Promise<UdifInteractionAudit | null> {
  try {
    let governance = input.governance;
    if (!governance && input.contextRole) {
      governance = await resolveGovernance({ contextRole: input.contextRole });
    }

    const record = buildAuditRecord({
      trace_context: input.traceContext ?? newTrace(),
      context_baggage: {
        ...(input.macroWorkflowId ? { macro_workflow_id: input.macroWorkflowId } : {}),
        credit_cost: String(input.creditCost),
        content_mode: input.contentMode ?? "metadata",
      },
      ai_ledger: {
        system_provider: input.systemProvider,
        "gen_ai.request.model": input.requestedModelId,
        "gen_ai.response.model": input.actualModelId,
        agent_identity: {
          name: input.agentName,
          role: input.agentRole,
        },
        ...(input.usage ? { usage: input.usage } : {}),
        ...(input.actions && input.actions.length ? { actions: input.actions } : {}),
        ...(governance ? { governance } : {}),
      },
    });

    // Fire-and-forget, non-blocking. Sink errors are swallowed.
    void Promise.resolve(getSink().emit(record)).catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[telemetry] sink emit failed (non-blocking):", err);
      }
    });

    return record;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[telemetry] emitInteractionAudit failed (non-blocking):", err);
    }
    return null;
  }
}
