/**
 * lib/telemetry/riskQuantifier.ts
 *
 * Lightweight ALE-style risk quantification mapper.
 *
 * Translates raw operational telemetry into board-ready risk metrics
 * without expanding the core execution loop. Runs fire-and-forget
 * alongside the existing telemetry pipeline.
 *
 * Design:
 *  - SLE: symbolic single-loss exposure weight
 *  - ARO: symbolic annualized rate from observed frequency
 *  - ALE proxy: emitted as a normalized telemetry event for aggregation
 */

export type RiskEventType =
  | 'provider_fallback'
  | 'circuit_breaker_trip'
  | 'unauthorized_tool_attempt'
  | 'prompt_injection_attempt'
  | 'harness_selection_fallback'
  | 'tool_execution_failure'
  | 'context_firewall_deny';

export interface RiskEvent {
  event_type: RiskEventType;
  trace_id?: string;
  workspace_id?: string;
  user_id?: string;
  sle_weight: number;
  aro_weight: number;
  ale_proxy: number;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

const SLE_WEIGHTS: Record<RiskEventType, number> = {
  provider_fallback: 3,
  circuit_breaker_trip: 5,
  unauthorized_tool_attempt: 8,
  prompt_injection_attempt: 9,
  harness_selection_fallback: 4,
  tool_execution_failure: 4,
  context_firewall_deny: 7,
};

const ARO_WEIGHTS: Record<RiskEventType, number> = {
  provider_fallback: 2,
  circuit_breaker_trip: 1,
  unauthorized_tool_attempt: 2,
  prompt_injection_attempt: 3,
  harness_selection_fallback: 1,
  tool_execution_failure: 3,
  context_firewall_deny: 2,
};

function aleProxy(sle: number, aro: number): number {
  return sle * aro;
}

export function buildRiskEvent(input: {
  eventType: RiskEventType;
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): RiskEvent {
  const sle = SLE_WEIGHTS[input.eventType] ?? 1;
  const aro = ARO_WEIGHTS[input.eventType] ?? 1;
  return {
    event_type: input.eventType,
    trace_id: input.traceId,
    workspace_id: input.workspaceId,
    user_id: input.userId,
    sle_weight: sle,
    aro_weight: aro,
    ale_proxy: aleProxy(sle, aro),
    metadata: input.metadata ?? {},
    occurred_at: new Date().toISOString(),
  };
}
