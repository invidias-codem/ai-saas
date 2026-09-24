// lib/intelligence/decision/replay/normalize.ts
// Slice 3: the ONLY place that knows Supabase JSON metadata keys
// (metadata->>'proposedCapability' etc). Policy code must never see them.
// Joins decision_event + jev_shadow_decision + ucol_routing_telemetry on
// requestId into a frozen RoutingReplayRecord.

import type {
  CorrectionSignal,
  Effort,
  OutcomeStatus,
  RoutingReplayRecord,
  Tier,
} from './types';
import type { DecisionFailureReason, DecisionLease } from '../contracts';

// Loose row shapes — what the script actually SELECTs out of Supabase.
export interface TelemetryRow {
  event_type: string;
  metadata: Record<string, unknown> | null;
}

export interface UcolTelemetryRow {
  request_id: string;
  outcome: OutcomeStatus;
  latency_ms?: number | null;
  estimated_cost_usd?: number | null;
  user_correction_signal?: CorrectionSignal | null;
}

const CAPABILITIES: ReadonlySet<string> = new Set(['fast', 'quality', 'reasoning']);
const EFFORTS: ReadonlySet<string> = new Set(['low', 'medium', 'high', 'max']);
const LEASES: ReadonlySet<string> = new Set(['one_call', 'tool_chain', 'user_turn']);
const FAILURE_REASONS: ReadonlySet<string> = new Set([
  'no_api_key',
  'budget_exhausted',
  'http_terminal',
  'response_invalid',
  'network_error',
]);

function asNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function asTier(v: unknown): Tier | undefined {
  return typeof v === 'string' && CAPABILITIES.has(v) ? (v as Tier) : undefined;
}
function asEffort(v: unknown): Effort | undefined {
  return typeof v === 'string' && EFFORTS.has(v) ? (v as Effort) : undefined;
}
function asLease(v: unknown): DecisionLease | undefined {
  return typeof v === 'string' && LEASES.has(v) ? (v as DecisionLease) : undefined;
}
function asFailureReason(v: unknown): DecisionFailureReason | undefined {
  return typeof v === 'string' && FAILURE_REASONS.has(v) ? (v as DecisionFailureReason) : undefined;
}

function productionTierFromModelRef(ref: unknown): Tier {
  if (typeof ref === 'string') {
    const suffix = ref.split('.').pop() ?? '';
    if (suffix === 'fast' || suffix === 'quality' || suffix === 'reasoning') return suffix;
    if (suffix === 'agentic') return 'reasoning';
  }
  return 'fast'; // ponytail: matches the shadow path's production-tier fallback
}

// Prefer the shadow event's own productionTier (already normalized upstream);
// fall back to parsing the model ref.
function resolveProductionTier(shadow: Record<string, unknown>, firstRef: unknown): Tier {
  const direct = asTier(shadow.productionTier);
  if (direct) return direct;
  return productionTierFromModelRef(firstRef);
}

export function normalizeRows(
  telemetryRows: TelemetryRow[],
  ucolRows: UcolTelemetryRow[],
): RoutingReplayRecord[] {
  const outcomesByRequest = new Map<string, UcolTelemetryRow>();
  for (const r of ucolRows) outcomesByRequest.set(r.request_id, r);

  const shadowByRequest = new Map<string, Record<string, unknown>>();
  let decisionEvent: TelemetryRow | undefined;
  const decisionEventsByRequest = new Map<string, TelemetryRow>();

  for (const row of telemetryRows) {
    const meta = row.metadata ?? {};
    const requestId = typeof meta.requestId === 'string' ? meta.requestId : undefined;
    if (!requestId) continue;
    if (row.event_type === 'jev_shadow_decision') {
      shadowByRequest.set(requestId, meta);
    } else if (row.event_type === 'decision_event') {
      decisionEventsByRequest.set(requestId, row);
      if (!decisionEvent) decisionEvent = row;
    }
  }

  const records: RoutingReplayRecord[] = [];
  for (const [requestId, shadow] of shadowByRequest) {
    const outcomeRow = outcomesByRequest.get(requestId);
    if (!outcomeRow) continue; // can't compare hypothetical vs actual without actual

    const deMeta = (decisionEventsByRequest.get(requestId)?.metadata ?? {}) as Record<string, unknown>;

    const status = shadow.status;
    const usable = status === 'ok';
    const failureReason = asFailureReason(shadow.jevFailureReason);

    const judgment: RoutingReplayRecord['judgment'] = usable
      ? {
          taskClass: typeof shadow.jevIntent === 'string' ? shadow.jevIntent : undefined,
          capability: asTier(shadow.proposedCapability),
          effort: asEffort(shadow.proposedEffort),
          riskSignal: asNum(shadow.riskSignal),
          lease: asLease(shadow.proposedLease),
        }
      : null;

    const modelRefs = Array.isArray(shadow.productionModelRef)
      ? (shadow.productionModelRef as string[])
      : typeof shadow.productionModelRef === 'string'
        ? [shadow.productionModelRef]
        : [];

    const experiment = {
      planeSchemaVersion: asNum(shadow.decisionPlaneSchemaVersion ?? deMeta.planeSchemaVersion) ?? 1,
      questionSetVersion: asNum(shadow.questionSetVersion ?? deMeta.questionSetVersion) ?? 1,
      tierPolicyVersion: asNum(shadow.tierPolicyVersion) ?? 1,
      engineId: typeof deMeta.engineId === 'string' ? deMeta.engineId : 'jev',
      engineModel:
        typeof shadow.decisionModel === 'string'
          ? shadow.decisionModel
          : typeof deMeta.engineModel === 'string'
            ? deMeta.engineModel
            : 'unknown',
    };

    records.push({
      requestId,
      experiment,
      judgment,
      decisionFailure:
        !usable && failureReason
          ? {
              reason: failureReason,
              attemptCount: asNum(shadow.jevAttemptCount) ?? 0,
              latencyMs: asNum(shadow.jevLatencyMs) ?? 0,
            }
          : undefined,
      production: {
        intent: typeof shadow.productionIntent === 'string' ? shadow.productionIntent : 'unknown',
        tier: resolveProductionTier(shadow, modelRefs[0]),
        modelRefs,
      },
      outcome: {
        status: outcomeRow.outcome,
        latencyMs: outcomeRow.latency_ms ?? undefined,
        estimatedCostUsd: outcomeRow.estimated_cost_usd ?? undefined,
        correctionSignal: outcomeRow.user_correction_signal ?? undefined,
      },
    });
  }
  return records;
}
