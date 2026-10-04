// __tests__/contracts/decision-plane-promotion.contract.test.ts
// Slice 3B contract suite. Locks: four-state behavior, reason-code
// precedence, integrity-never-eligible, determinism, purity, cohort
// identity, no input mutation.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  evaluatePromotion,
  PROMOTION_GATE_VERSION,
  PROMOTION_PROFILE_V1,
  type PromotionGateInput,
} from '@/lib/intelligence/decision/replay/promotion';
import type { NormalizationDiagnostics } from '@/lib/intelligence/decision/replay/normalize';
import type { RoutingReplayRecord } from '@/lib/intelligence/decision/replay/types';
import type { ReplayReport } from '@/lib/intelligence/decision/replay/metrics';

function rec(over: Partial<RoutingReplayRecord> = {}): RoutingReplayRecord {
  return {
    requestId: 'r1',
    experiment: { planeSchemaVersion: 1, questionSetVersion: 2, tierPolicyVersion: 2, engineId: 'jev', engineModel: 'm' },
    judgment: { taskClass: 't', capability: 'fast', effort: 'low', riskSignal: 0.1, lease: 'one_call' },
    production: { intent: 'coding_task', tier: 'reasoning', modelRefs: ['x.reasoning'] },
    outcome: { status: 'success' },
    decision: { available: true, latencyMs: 100, inputTokens: 10, outputTokens: 5 },
    ...over,
  };
}

const cleanDiag: NormalizationDiagnostics = {
  shadowRows: 200, outcomeRows: 200, joinedRows: 200, missingOutcomeRows: 0,
  duplicateShadowRequests: 0, duplicateOutcomeRequests: 0, rejectedMalformedRows: 0,
};

function report(over: Partial<ReplayReport> = {}): ReplayReport {
  return {
    total: 200, usable: 200, unavailable: 0, availabilityRate: 1,
    tierDelta: { same: 140, hypothetical_lower: 60, hypothetical_higher: 0 },
    productionOutcomes: { success: 200 },
    productionSuccessRate: 1,
    explicitCorrectionRate: 0,
    latencyMs: { mean: 500, p50: 500, p95: 800 },
    costUsd: { mean: 0.01, total: 2 },
    byDeltaSuccessRate: { same: 1, hypothetical_lower: 0.9, hypothetical_higher: null },
    byIntent: {}, byCapability: {}, byEffort: {}, byLease: {}, byRiskBand: {},
    byQuestionSetVersion: {}, byTierPolicyVersion: {},
    ...over,
  };
}

function gate(over: Partial<PromotionGateInput> = {}): PromotionGateInput {
  return {
    datasetHash: 'abc',
    policyId: 'routing-capability-v1',
    policyVersion: '1',
    report: report(),
    records: [rec()],
    diagnostics: cleanDiag,
    profile: PROMOTION_PROFILE_V1,
    ...over,
  };
}

describe('decision plane promotion gate — slice 3B contracts', () => {
  it('1: clean, informative evidence yields CANARY_ELIGIBLE with the eligibility reason code', () => {
    const d = evaluatePromotion(gate());
    expect(d.status).toBe('CANARY_ELIGIBLE');
    expect(d.reasonCodes).toEqual(['eligible_for_bounded_canary']);
    expect(d.gateVersion).toBe(PROMOTION_GATE_VERSION);
    expect(d.promotionProfileVersion).toBe('promotion-profile-v1');
  });

  it('2: integrity failure NEVER yields CANARY_ELIGIBLE — even with perfect metrics', () => {
    const d = evaluatePromotion(gate({
      diagnostics: { ...cleanDiag, rejectedMalformedRows: 5 },
    }));
    expect(d.status).toBe('DISQUALIFIED');
    expect(d.reasonCodes).toContain('normalization_integrity_failed');
    // Duplicate rate alone also disqualifies.
    const d2 = evaluatePromotion(gate({
      diagnostics: { ...cleanDiag, duplicateOutcomeRequests: 10 },
    }));
    expect(d2.status).toBe('DISQUALIFIED');
    expect(d2.reasonCodes).toContain('duplicate_rate_above_max');
  });

  it('3: sample shortfall yields INSUFFICIENT_EVIDENCE with distinct reason codes', () => {
    const d = evaluatePromotion(gate({
      diagnostics: { ...cleanDiag, joinedRows: 42, shadowRows: 42 },
    }));
    expect(d.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(d.reasonCodes).toContain('insufficient_joined_samples');

    const d2 = evaluatePromotion(gate({
      report: report({ total: 200, usable: 100, unavailable: 100, availabilityRate: 0.5 }),
    }));
    expect(d2.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(d2.reasonCodes).toContain('decision_availability_below_floor');
  });

  it('4: latency budget exceeded disqualifies even with ample clean samples', () => {
    const slow = Array.from({ length: 5 }, () => rec({ decision: { available: true, latencyMs: 5000 } }));
    const d = evaluatePromotion(gate({ records: slow }));
    expect(d.status).toBe('DISQUALIFIED');
    expect(d.reasonCodes).toContain('latency_budget_exceeded');
  });

  it('5: clean evidence without an informative divergence cohort stays SHADOW_ONLY', () => {
    const d = evaluatePromotion(gate({
      report: report({ tierDelta: { same: 200, hypothetical_lower: 0, hypothetical_higher: 0 } }),
    }));
    expect(d.status).toBe('SHADOW_ONLY');
    expect(d.reasonCodes).toContain('benefit_not_demonstrated');
  });

  it('6: integrity failure outranks sample shortfall (precedence)', () => {
    const d = evaluatePromotion(gate({
      diagnostics: { ...cleanDiag, joinedRows: 10, shadowRows: 10, rejectedMalformedRows: 9 },
    }));
    expect(d.status).toBe('DISQUALIFIED');
    expect(d.reasonCodes).toContain('normalization_integrity_failed');
    expect(d.reasonCodes).not.toContain('insufficient_joined_samples');
  });

  it('7: identical input yields byte-identical decisions (determinism)', () => {
    const a = evaluatePromotion(gate());
    const b = evaluatePromotion(gate());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('8: gate never mutates its inputs', () => {
    const input = gate();
    const before = JSON.parse(JSON.stringify(input));
    evaluatePromotion(input);
    expect(input).toEqual(before);
  });

  it('9: cohort identity is carried on the decision (QSV/TPV from records)', () => {
    const d = evaluatePromotion(gate({
      records: [rec({ experiment: { planeSchemaVersion: 1, questionSetVersion: 7, tierPolicyVersion: 3, engineId: 'jev', engineModel: 'm' } })],
    }));
    expect(d.questionSetVersion).toBe(7);
    expect(d.tierPolicyVersion).toBe(3);
    // Empty records → cohort 0, never a crash.
    const d2 = evaluatePromotion(gate({ records: [] }));
    expect(d2.questionSetVersion).toBe(0);
  });

  it('10: purity — no engine/provider/supabase/network imports, no Date.now/random', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/decision/replay/promotion.ts'), 'utf8');
    expect(src).not.toMatch(/from ['\"]@\/lib\/supabaseClient|supabaseAdmin|fetch\(|axios|undici/);
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)/);
    // No global Jev confidence threshold — invariant stays contract-locked.
    expect(src).not.toMatch(/confidence.*(threshold|floor)|(threshold|floor).*confidence/i);
  });

  it('11: decision-cost metrics are surfaced for economics accounting', () => {
    const d = evaluatePromotion(gate({
      records: [
        rec({ decision: { available: true, latencyMs: 100, inputTokens: 10, outputTokens: 5 } }),
        rec({ requestId: 'r2', decision: { available: true, latencyMs: 300, inputTokens: 20, outputTokens: 15 } }),
      ],
    }));
    expect(d.metrics.decisionInputTokens).toBe(30);
    expect(d.metrics.decisionOutputTokens).toBe(20);
    expect(d.metrics.decisionLatencyP95Ms).toBe(300);
  });

  it('12: no causal overclaim in the gate source — eligibility language only', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/decision/replay/promotion.ts'), 'utf8');
    expect(src).not.toMatch(/would have succeeded|wouldHaveSucceeded|proves? (the )?lower/);
  });
});
