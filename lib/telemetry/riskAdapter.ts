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
    void supabaseAdmin.from('risk_events').insert({
      event_type: event.event_type,
      trace_id: event.trace_id,
      workspace_id: event.workspace_id,
      user_id: event.user_id,
      metadata: {
        sle_weight: event.sle_weight,
        aro_weight: event.aro_weight,
        ale_proxy: event.ale_proxy,
        occurred_at: event.occurred_at,
        ...event.metadata,
      },
    });
  } catch {
    // never break operational path due to risk telemetry
  }
}
