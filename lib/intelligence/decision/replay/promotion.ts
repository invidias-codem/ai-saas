// lib/intelligence/decision/replay/promotion.ts
// Slice 3B: versioned promotion gate. PURE — no I/O, wall-clock reads, RNG,
// DB/network/engine imports, or input mutation.
//
// CANARY_ELIGIBLE means "permitted to enter the next EXPERIMENT" — never
// an automatic activation. No causal claim is made: historical success
// under the production tier does not prove the hypothetical tier would
// have succeeded; the gate only certifies the evidence is sufficient to
// TEST that question in a bounded canary.

import type { NormalizationDiagnostics } from './normalize';
import type { RoutingReplayRecord } from './types';
import type { ReplayReport } from './metrics';

export type PromotionStatus =
  | 'INSUFFICIENT_EVIDENCE'
  | 'DISQUALIFIED'
  | 'SHADOW_ONLY'
  | 'CANARY_ELIGIBLE';

export interface RoutingPromotionProfileV1 {
  profileVersion: 'promotion-profile-v1';
  /** Minimum joined shadow+outcome rows in the evaluation window. */
  minJoinedSamples: number;
  /** Minimum fraction of rows with a usable decision (judgment !== null). */
  minDecisionAvailability: number;
  /** Max rejectedMalformedRows / max(shadowRows,1). */
  maxMalformedRate: number;
  /** Max duplicate rows / max(shadowRows,1) — dedup happened, but noise has a ceiling. */
  maxDuplicateRate: number;
  /** Decision-model latency p95 budget (ms) — it runs off the critical path today;
   *  this ceiling keeps the future canary honest about overhead. */
  decisionLatencyP95BudgetMs: number;
  /** Minimum hypothetical_lower cohort size — a policy that always agrees with
   *  production cannot justify a canary; there is nothing to learn. */
  minLowerDeltaCohort: number;
  /** Minimum hypothetical_lower rows with observed production success — the
   *  descriptive (NOT causal) signal that a downgrade cohort is testable. */
  minLowerDeltaCohortWithSuccess: number;
}

/**
 * PROVISIONAL frozen profile. The TYPESAFE_API_KEY waitlist has blocked the
 * calibration dataset, so these ceilings are conservative placeholders.
 * RULE: replace each value from the CALIBRATION window's observed
 * distribution before any CANARY_ELIGIBLE is honored, then re-freeze as the
 * same profileVersion with an amended note — the evaluation window must
 * never be the window the thresholds were derived from.
 */
export const PROMOTION_PROFILE_V1: RoutingPromotionProfileV1 = {
  profileVersion: 'promotion-profile-v1',
  minJoinedSamples: 200,
  minDecisionAvailability: 0.95,
  maxMalformedRate: 0.01,
  maxDuplicateRate: 0.02,
  decisionLatencyP95BudgetMs: 400,
  minLowerDeltaCohort: 50,
  minLowerDeltaCohortWithSuccess: 25,
};

export interface PromotionDecision {
  status: PromotionStatus;
  gateVersion: string;
  datasetHash: string;
  policyId: string;
  policyVersion: string;
  questionSetVersion: number;
  tierPolicyVersion: number;
  promotionProfileVersion: string;
  reasonCodes: string[];
  metrics: Record<string, number | null>;
}

export const PROMOTION_GATE_VERSION = 'promotion-gate-v1';

export interface PromotionGateInput {
  datasetHash: string;
  policyId: string;
  policyVersion: string;
  report: ReplayReport;
  records: RoutingReplayRecord[];
  diagnostics: NormalizationDiagnostics;
  profile: RoutingPromotionProfileV1;
}

function p95(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))];
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * evaluatePromotion — deterministic, order-independent, side-effect free.
 * Precedence (first failing tier wins):
 *   1. Integrity failures → DISQUALIFIED (never eligible).
 *   2. Sample/availability shortfall → INSUFFICIENT_EVIDENCE.
 *   3. Latency budget exceeded → DISQUALIFIED (overhead already too high).
 *   4. No informative divergence cohort → SHADOW_ONLY.
 *   5. Else → CANARY_ELIGIBLE.
 */
export function evaluatePromotion(input: PromotionGateInput): PromotionDecision {
  const { profile, report, records, diagnostics } = input;

  const reasonCodes: string[] = [];
  const joined = diagnostics.joinedRows;
  const shadowBase = Math.max(diagnostics.shadowRows, 1);
  const malformedRate = diagnostics.rejectedMalformedRows / shadowBase;
  const duplicateRate =
    (diagnostics.duplicateShadowRequests + diagnostics.duplicateOutcomeRequests) / shadowBase;

  const decisionLatencies = records
    .map((r) => r.decision?.latencyMs)
    .filter((v): v is number => typeof v === 'number');
  const decisionLatencyP95 = p95(decisionLatencies);
  const decisionInputTokens = sum(
    records.map((r) => r.decision?.inputTokens ?? 0),
  ) || null;
  const decisionOutputTokens = sum(
    records.map((r) => r.decision?.outputTokens ?? 0),
  ) || null;
  const availability = report.total > 0 ? report.usable / report.total : null;

  // CohortVersion identity comes from the records; empty records → cohort 0.
  const qsv = records[0]?.experiment.questionSetVersion ?? 0;
  const tpv = records[0]?.experiment.tierPolicyVersion ?? 0;

  const metrics: Record<string, number | null> = {
    joinedSamples: joined,
    totalSamples: report.total,
    usableSamples: report.usable,
    decisionAvailability: availability,
    malformedRate,
    duplicateRate,
    decisionLatencyP95Ms: decisionLatencyP95,
    decisionInputTokens: decisionInputTokens,
    decisionOutputTokens: decisionOutputTokens,
    lowerDeltaCohort: report.tierDelta.hypothetical_lower,
    lowerDeltaWithSuccess: report.byDeltaSuccessRate.hypothetical_lower !== null
      ? Math.round(report.byDeltaSuccessRate.hypothetical_lower * report.tierDelta.hypothetical_lower)
      : null,
    productionSuccessRate: report.productionSuccessRate,
    explicitCorrectionRate: report.explicitCorrectionRate,
  };

  let status: PromotionStatus;

  // 1. Integrity — hard disqualification. Integrity failure can NEVER yield
  //    CANARY_ELIGIBLE, even if every other number looks fine.
  const integrityFailed =
    malformedRate > profile.maxMalformedRate || duplicateRate > profile.maxDuplicateRate;
  if (integrityFailed) {
    status = 'DISQUALIFIED';
    if (malformedRate > profile.maxMalformedRate) reasonCodes.push('normalization_integrity_failed');
    if (duplicateRate > profile.maxDuplicateRate) reasonCodes.push('duplicate_rate_above_max');
  } else if (joined < profile.minJoinedSamples || availability === null || availability < profile.minDecisionAvailability) {
    // 2. Not enough trustworthy evidence to say anything.
    status = 'INSUFFICIENT_EVIDENCE';
    if (joined < profile.minJoinedSamples) reasonCodes.push('insufficient_joined_samples');
    if (availability === null || availability < profile.minDecisionAvailability) {
      reasonCodes.push('decision_availability_below_floor');
    }
  } else if (
    decisionLatencyP95 !== null &&
    decisionLatencyP95 > profile.decisionLatencyP95BudgetMs
  ) {
    // 3. The decision model itself is already too expensive to canary.
    status = 'DISQUALIFIED';
    reasonCodes.push('latency_budget_exceeded');
  } else if (
    report.tierDelta.hypothetical_lower < profile.minLowerDeltaCohort ||
    (metrics.lowerDeltaWithSuccess ?? 0) < profile.minLowerDeltaCohortWithSuccess
  ) {
    // 4. Evidence is clean but not informative: the policy doesn't diverge
    //    from production in a testable direction. Keep shadowing.
    status = 'SHADOW_ONLY';
    reasonCodes.push('benefit_not_demonstrated');
  } else {
    status = 'CANARY_ELIGIBLE';
    reasonCodes.push('eligible_for_bounded_canary');
  }

  return {
    status,
    gateVersion: PROMOTION_GATE_VERSION,
    datasetHash: input.datasetHash,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    questionSetVersion: qsv,
    tierPolicyVersion: tpv,
    promotionProfileVersion: profile.profileVersion,
    reasonCodes,
    metrics,
  };
}
