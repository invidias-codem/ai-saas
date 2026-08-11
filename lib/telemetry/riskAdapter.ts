/**
 * Fire-and-forget risk telemetry mapper.
 *
 * Translates operational events into ALE-style records and writes them
 * to `harness_telemetry_events` for dashboard aggregation.
 */

import { supabaseAdmin } from '@/lib/supabaseClient';
import { buildRiskEvent, RiskEvent, RiskEventType } from './riskQuantifier';

export async function emitRiskEvent(input: {
  eventType: RiskEventType;
  traceId?: string;
  workspaceId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const event = buildRiskEvent(input);
    if (!supabaseAdmin) return;
    const payload: Record<string, unknown> = {
      event_type: `risk.${event.event_type}`,
      operation_type: 'risk_quantifier',
      success: true,
      duration_ms: 0,
      metadata: {
        sle_weight: event.sle_weight,
        aro_weight: event.aro_weight,
        ale_proxy: event.ale_proxy,
        occurred_at: event.occurred_at,
        ...event.metadata,
      },
    };
    if (event.trace_id) payload.trace_id = event.trace_id;
    if (event.workspace_id) payload.workspace_id = event.workspace_id;
    if (event.user_id) payload.user_id = event.user_id;

    void supabaseAdmin.from('harness_telemetry_events').insert(payload);
  } catch {
    // never break operational path due to risk telemetry
  }
}
