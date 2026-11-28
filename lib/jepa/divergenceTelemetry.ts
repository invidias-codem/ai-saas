/**
 * lib/jepa/divergenceTelemetry.ts
 *
 * Divergence telemetry sink for JEPA/MCTS planning signals.
 *
 * Writes to the isolated telemetry Supabase instance via
 * `supabaseTelemetryAdmin` so high-volume audit inserts never
 * starve the main transactional DB.
 *
 * Non-blocking by design: every write is fire-and-forget.
 */

import { supabaseTelemetryAdmin, supabaseAdmin } from '@/lib/supabaseClient';

export type DivergenceEventType =
  | 'jepa-encode-success'
  | 'jepa-encode-failure'
  | 'mcts-simulation'
  | 'circuit-breaker-open'
  | 'circuit-breaker-close'
  | 'circuit-breaker-halfopen'
  | 'syntactic-fallback';

export interface DivergenceEvent {
  eventType: DivergenceEventType;
  predictorId?: string;
  circuitState?: string;
  divergence?: number;
  confidence?: number;
  detail?: string;
  latencyMs?: number;
  fallbackUsed?: boolean;
  queryHash?: string;
  createdAt?: string;
}

const TABLE = 'jepa_divergence_events';

function getAdmin() {
  return supabaseTelemetryAdmin ?? supabaseAdmin;
}

function safeInsert(payload: DivergenceEvent) {
  const admin = getAdmin();
  if (!admin) return;

  void Promise.resolve(
    admin.from(TABLE).insert({
      event_type: payload.eventType,
      predictor_id: payload.predictorId ?? null,
      circuit_state: payload.circuitState ?? null,
      divergence: payload.divergence ?? null,
      confidence: payload.confidence ?? null,
      detail: payload.detail ?? null,
      latency_ms: payload.latencyMs ?? null,
      fallback_used: payload.fallbackUsed ?? null,
      query_hash: payload.queryHash ?? null,
      created_at: payload.createdAt ?? new Date().toISOString(),
    })
  ).catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[jepa-telemetry] insert failed (non-blocking):', err);
    }
  });
}

export async function recordDivergenceEvent(event: DivergenceEvent): Promise<void> {
  safeInsert(event);
}

export function recordDivergenceEventSync(event: DivergenceEvent): void {
  safeInsert(event);
}
