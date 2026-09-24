// Slice 3: aggregation + stratification. PURE. Descriptive labels only —
// no causal claims (a 'hypothetical_lower' row with success does NOT prove
// the lower tier would have succeeded; it identifies a cohort worth testing).

import type { RoutingProposal, RoutingReplayRecord } from './types';
import { tierDelta, type TierDelta } from './kernel';

export interface CohortProposal {
  record: RoutingReplayRecord;
  proposal: RoutingProposal;
}

function pctl(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

interface Bucket {
  total: number;
  ok: number;
}
function bump(map: Map<string, Bucket>, key: string, success: boolean) {
  const b = map.get(key) ?? { total: 0, ok: 0 };
  b.total += 1;
  if (success) b.ok += 1;
  map.set(key, b);
}
function fin(map: Map<string, Bucket>): Record<string, { total: number; successRate: number | null }> {
  const out: Record<string, { total: number; successRate: number | null }> = {};
  for (const [k, b] of [...map.entries()].sort()) {
    out[k] = { total: b.total, successRate: b.total ? b.ok / b.total : null };
  }
  return out;
}

export interface ReplayReport {
  total: number;
  usable: number;
  unavailable: number;
  availabilityRate: number | null;

  tierDelta: Record<TierDelta, number>;

  productionOutcomes: Record<string, number>;
  productionSuccessRate: number | null;
  explicitCorrectionRate: number | null;

  latencyMs: { mean: number | null; p50: number | null; p95: number | null };
  costUsd: { mean: number | null; total: number | null };

  byDeltaSuccessRate: Record<TierDelta, number | null>;

  byIntent: Record<string, { total: number; successRate: number | null }>;
  byCapability: Record<string, { total: number; successRate: number | null }>;
  byEffort: Record<string, { total: number; successRate: number | null }>;
  byLease: Record<string, { total: number; successRate: number | null }>;
  byRiskBand: Record<string, { total: number; successRate: number | null }>;
  byQuestionSetVersion: Record<string, { total: number; successRate: number | null }>;
  byTierPolicyVersion: Record<string, { total: number; successRate: number | null }>;
}

// ponytail: equidistant risk bands — replacement is quantile-based bucketing
// once we know the empirical distribution.
function riskBand(r: number | undefined): string {
  if (r === undefined) return 'unknown';
  if (r < 0.25) return 'low';
  if (r < 0.5) return 'medium';
  if (r < 0.75) return 'high';
  return 'critical';
}

const isSuccess = (s: string) => s === 'success';

export function buildReport(proposals: CohortProposal[]): ReplayReport {
  const total = proposals.length;
  const usable = proposals.filter((p) => p.record.judgment !== null).length;
  const unavailable = total - usable;

  const delta: Record<TierDelta, number> = {
    same: 0,
    hypothetical_lower: 0,
    hypothetical_higher: 0,
  };
  const deltaSuccess: Record<TierDelta, { total: number; ok: number }> = {
    same: { total: 0, ok: 0 },
    hypothetical_lower: { total: 0, ok: 0 },
    hypothetical_higher: { total: 0, ok: 0 },
  };

  const productionOutcomes: Record<string, number> = {};
  const latencies: number[] = [];
  const costs: number[] = [];
  let okCount = 0;
  let explicitCorrection = 0;
  let correctionTotal = 0;

  const byIntent = new Map<string, Bucket>();
  const byCapability = new Map<string, Bucket>();
  const byEffort = new Map<string, Bucket>();
  const byLease = new Map<string, Bucket>();
  const byRiskBand = new Map<string, Bucket>();
  const byQsv = new Map<string, Bucket>();
  const byTpv = new Map<string, Bucket>();

  for (const { record, proposal } of proposals) {
    const success = isSuccess(record.outcome.status);
    if (success) okCount += 1;
    productionOutcomes[record.outcome.status] = (productionOutcomes[record.outcome.status] ?? 0) + 1;

    if (record.outcome.latencyMs !== undefined) latencies.push(record.outcome.latencyMs);
    if (record.outcome.estimatedCostUsd !== undefined) costs.push(record.outcome.estimatedCostUsd);
    if (record.outcome.correctionSignal !== undefined) {
      correctionTotal += 1;
      if (record.outcome.correctionSignal === 'explicit') explicitCorrection += 1;
    }

    if (record.judgment !== null) {
      const d = tierDelta(record.production.tier, proposal.tier);
      delta[d] += 1;
      deltaSuccess[d].total += 1;
      if (success) deltaSuccess[d].ok += 1;
    }

    bump(byIntent, record.production.intent, success);
    if (record.judgment?.capability) bump(byCapability, record.judgment.capability, success);
    if (record.judgment?.effort) bump(byEffort, record.judgment.effort, success);
    if (record.judgment?.lease) bump(byLease, record.judgment.lease, success);
    bump(byRiskBand, riskBand(record.judgment?.riskSignal), success);
    bump(byQsv, String(record.experiment.questionSetVersion), success);
    bump(byTpv, String(record.experiment.tierPolicyVersion), success);
  }

  latencies.sort((a, b) => a - b);

  return {
    total,
    usable,
    unavailable,
    availabilityRate: total ? usable / total : null,

    tierDelta: delta,

    productionOutcomes,
    productionSuccessRate: total ? okCount / total : null,
    explicitCorrectionRate: correctionTotal ? explicitCorrection / correctionTotal : null,

    latencyMs: {
      mean: mean(latencies),
      p50: pctl(latencies, 50),
      p95: pctl(latencies, 95),
    },
    costUsd: {
      mean: mean(costs),
      total: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    },

    byDeltaSuccessRate: {
      same: deltaSuccess.same.total ? deltaSuccess.same.ok / deltaSuccess.same.total : null,
      hypothetical_lower: deltaSuccess.hypothetical_lower.total
        ? deltaSuccess.hypothetical_lower.ok / deltaSuccess.hypothetical_lower.total
        : null,
      hypothetical_higher: deltaSuccess.hypothetical_higher.total
        ? deltaSuccess.hypothetical_higher.ok / deltaSuccess.hypothetical_higher.total
        : null,
    },

    byIntent: fin(byIntent),
    byCapability: fin(byCapability),
    byEffort: fin(byEffort),
    byLease: fin(byLease),
    byRiskBand: fin(byRiskBand),
    byQuestionSetVersion: fin(byQsv),
    byTierPolicyVersion: fin(byTpv),
  };
}
