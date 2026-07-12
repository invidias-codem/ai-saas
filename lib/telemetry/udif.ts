/**
 * UDIF 2.0 schema — Sovereign AI Telemetry ledger types.
 *
 * Canonical contract from PRD §3 / §3.1 (Sovereign_AI_Telemetry_PRD.pdf).
 * Keep this file dependency-free (types only) so it can be imported from
 * server, client, service worker, and tests without side effects.
 *
 * Note: PRD §3.1 uses fictional values (e.g. "claude-fable-5-base"). The
 * `gen_ai.response.model` field is populated at runtime from the real
 * `providerResolution.execution.modelId` in lib/llm/conversationEngine.ts.
 */

export const UDIF_VERSION = "2.0" as const;
export type UdifVersion = typeof UDIF_VERSION;

export type UdifRecordType = "ai_interaction_audit";

/** W3C Trace Context (PRD §3). */
export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
}

/** Which sub-agent within the fleet executed the inference (PRD §3). */
export interface AgentIdentity {
  name: string;
  role: string;
}

/**
 * Requested vs. actual executed model tier + serving provider
 * (PRD §3 "Model Routing"). `request.model` is the configured id;
 * `response.model` is the actual `actualModelId` after resolution/fallback.
 */
export interface ModelRouting {
  "gen_ai.request.model": string;
  "gen_ai.response.model": string;
  system_provider: string; // e.g. "anthropic" | "openai" | "google" | "local"
}

/** A single tool invocation span (PRD §3 "Tool Execution Log"). */
export interface ToolAction {
  span_type: string; // e.g. "execute_tool"
  "tool.name": string;
  duration_ms: number;
  status: string; // e.g. "success" | "error"
}

/**
 * Governance snapshot resolved at request-packaging time (Phase 2.1).
 * Source of truth: Runtime Resolver + ephemeral cache + Supabase
 * agent_governance_policies.
 */
export interface GovernanceState {
  context_role: string;
  active_modules: string[];
  disabled_modules: string[];
  defense_triggers: string[];
}

/** Audit content handling mode (DECIDED 2026-07-12: hybrid, user-controlled). */
export type ContentMode = "metadata" | "hashed" | "local_only";

/**
 * The full UDIF 2.0 interaction-audit record.
 * `ai_ledger` mirrors the PRD §3 schema mapping exactly.
 */
export interface UdifInteractionAudit {
  udif_version: UdifVersion;
  record_type: UdifRecordType;
  timestamp: string; // ISO8601

  trace_context: TraceContext;

  /**
   * Opaque key/value baggage. Reserved keys:
   *  - macro_workflow_id: fleet-wide workflow correlation id
   *  - credit_cost: numeric cost in credits (joined from lib/subscription/packs.ts)
   *  - content_mode: ContentMode (metadata|hashed|local_only)
   */
  context_baggage?: Record<string, string>;

  ai_ledger: {
    system_provider: string;
    "gen_ai.request.model": string;
    "gen_ai.response.model": string;
    agent_identity?: AgentIdentity;
    performance?: { "gen_ai.client.operation.duration": number };
    usage?: { prompt_tokens: number; completion_tokens: number };
    actions?: ToolAction[];
    governance?: GovernanceState;
  };
}

/** Type guard: validates the structural shape of a UDIF record. */
export function isUdifInteractionAudit(value: unknown): value is UdifInteractionAudit {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<UdifInteractionAudit>;
  if (v.udif_version !== UDIF_VERSION) return false;
  if (v.record_type !== "ai_interaction_audit") return false;
  if (typeof v.timestamp !== "string") return false;
  if (typeof v.trace_context?.trace_id !== "string") return false;
  if (typeof v.trace_context?.span_id !== "string") return false;
  if (v.ai_ledger == null) return false;
  if (typeof v.ai_ledger["gen_ai.request.model"] !== "string") return false;
  if (typeof v.ai_ledger["gen_ai.response.model"] !== "string") return false;
  if (typeof v.ai_ledger.system_provider !== "string") return false;
  return true;
}
