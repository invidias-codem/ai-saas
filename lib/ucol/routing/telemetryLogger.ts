// lib/ucol/routing/telemetryLogger.ts
// Phase 4 scaffold: persists routing telemetry to Supabase for the bandit/admin view.

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import type { UcolRoutingTelemetry, UcolRoutingDecision } from './types';

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }
}

function sb() {
  assertSupabase();
  return supabaseAdmin!;
}

export async function logRoutingTelemetry(params: {
  decision?: UcolRoutingDecision;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  outcome: UcolRoutingTelemetry['outcome'];
  userCorrectionSignal?: UcolRoutingTelemetry['userCorrectionSignal'];
  notes?: string[];
}) {
  try {
    assertSupabase();

    const row = {
      id: params.decision?.requestId ?? randomUUID(),
      request_id: params.decision?.requestId ?? null,
      intent_category: params.decision?.intent?.category ?? 'general_chat',
      workspace_id: params.decision?.resolvedWorkspaceId ?? null,
      operating_profile_id: params.decision?.operatingProfileId ?? null,
      execution_mode: params.decision?.executionPlan?.mode ?? 'respond',
      selected_model_refs: params.decision?.providerPlan?.preferredModelRefs ?? [],
      selected_tools: params.decision?.toolPlan?.candidateTools ?? [],
      read_scopes: params.decision?.memoryPlan?.readScopes ?? [],
      memory_hits: null,
      graph_hits: null,
      latency_ms: params.latencyMs ?? null,
      estimated_cost_usd: params.estimatedCostUsd ?? null,
      outcome: params.outcome,
      user_correction_signal: params.userCorrectionSignal ?? 'none',
      notes: params.notes?.length ? params.notes.join('\n') : null,
    };

    const { error } = await sb()
      .from('ucol_routing_telemetry')
      .upsert(row, { onConflict: 'request_id' });

    if (error) {
      console.error('[RoutingTelemetry] insert failed:', error);
    }
  } catch (err) {
    console.error('[RoutingTelemetry] logger failed:', err);
  }
}
