/**
 * Decision Plane replay kernel contracts (slice 3).
 *
 * Locks:
 *   1. Replay never calls an engine.
 *   2. Replay never imports provider implementations.
 *   3. Same records + same policy → identical output (order-independent dataset).
 *   4. capabilityPolicyV1 maps only capability → tier.
 *   5. Effort does NOT silently mutate v1 tier.
 *   6. Risk signal does NOT override v1 tier.
 *   7. Lease does NOT alter routing yet.
 *   8. Missing/failed judgment → abstain (production tier, abstain reason code).
 *   9. No root confidence or global threshold.
 *  10. Tier comparisons use one explicit rank table.
 *  11. questionSetVersion=2 + tierPolicyVersion=2 are the default replay cohort.
 *  12. Results isolated by policyId + policyVersion.
 *  13. Historical production route is never mutated by replay.
 *  14. No Supabase/network imports inside the pure replay kernel.
 *  15. Counterfactual output is labeled hypothetical, never actual.
 *  16. Gen-0 and v2 records cannot enter the same replay cohort accidentally.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { datasetHash, replay, tierDelta, TIER_RANK } from '@/lib/intelligence/decision/replay/kernel';
import { normalizeRows } from '@/lib/intelligence/decision/replay/normalize';
import { CapabilityRoutingPolicyV1 } from '@/lib/intelligence/decision/policies/routing/capabilityPolicyV1';
import type { ReplayDataset, RoutingReplayRecord } from '@/lib/intelligence/decision/replay/types';

const BASE_RECORD: RoutingReplayRecord = {
  requestId: 'r1',
  experiment: {
    planeSchemaVersion: 1,
    questionSetVersion: 2,
    tierPolicyVersion: 2,
    engineId: 'jev',
    engineModel: 'jev-1.13.0',
  },
  judgment: {
    taskClass: 'coding_task',
    capability: 'quality',
    effort: 'medium',
    riskSignal: 0.2,
    lease: 'one_call',
  },
  production: {
    intent: 'coding_task',
    tier: 'quality',
    modelRefs: ['gemini.quality'],
  },
  outcome: {
    status: 'success',
    latencyMs: 1200,
    estimatedCostUsd: 0.004,
    correctionSignal: 'none',
  },
};

function rec(overrides: Partial<RoutingReplayRecord> = {}): RoutingReplayRecord {
  return { ...BASE_RECORD, ...overrides };
}

function datasetOf(records: RoutingReplayRecord[]): ReplayDataset {
  return { datasetHash: datasetHash(records), records };
}

describe('decision plane replay — slice 3 contracts', () => {
  it('1: replay kernel never imports an engine', () => {
    for (const f of ['replay/kernel.ts', 'replay/metrics.ts', 'replay/normalize.ts', 'replay/types.ts']) {
      const src = readFileSync(join(__dirname, '../../lib/intelligence/decision', f), 'utf8');
      expect(src).not.toMatch(/JevDecisionEngine|engines\/jev|shadowRouter/);
    }
  });

  it('2: replay kernel never imports provider implementations', () => {
    for (const f of ['replay/kernel.ts', 'replay/metrics.ts', 'replay/normalize.ts', 'replay/types.ts']) {
      const src = readFileSync(join(__dirname, '../../lib/intelligence/decision', f), 'utf8');
      expect(src).not.toMatch(/GeminiProvider|DeepSeekProvider|NvidiaNimProvider|resolveProviderForMode|llm\/providers/);
    }
  });

  it('3: same records + same policy → identical output regardless of input order', () => {
    const p1 = new CapabilityRoutingPolicyV1();
    const a = [rec({ requestId: 'a' }), rec({ requestId: 'b' }), rec({ requestId: 'c' })];
    const b = [a[2], a[0], a[1]];
    const r1 = replay(datasetOf(a), [p1]);
    const r2 = replay(datasetOf(b), [p1]);
    expect(r1).toEqual(r2);
    expect(r1.datasetHash).toBe(r2.datasetHash);
    expect(r1.results[0].resultHash).toBe(r2.results[0].resultHash);
  });

  it('4: capabilityPolicyV1 maps only capability → tier', () => {
    const policy = new CapabilityRoutingPolicyV1();
    expect(policy.evaluate(rec()).tier).toBe('quality');
    expect(policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, capability: 'reasoning' } })).tier).toBe('reasoning');
    expect(policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, capability: 'fast' } })).tier).toBe('fast');
  });

  it('5: effort does NOT silently mutate v1 tier', () => {
    const policy = new CapabilityRoutingPolicyV1();
    expect(
      policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, effort: 'max' } })).tier,
    ).toBe('quality');
    expect(
      policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, capability: 'fast', effort: 'max' } })).tier,
    ).toBe('fast');
  });

  it('6: risk signal does NOT override deterministic policy (v1 ignores it)', () => {
    const policy = new CapabilityRoutingPolicyV1();
    expect(
      policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, riskSignal: 0.99 } })).tier,
    ).toBe('quality');
  });

  it('7: lease does NOT alter routing yet', () => {
    const policy = new CapabilityRoutingPolicyV1();
    expect(
      policy.evaluate(rec({ judgment: { ...BASE_RECORD.judgment!, lease: 'user_turn' } })).tier,
    ).toBe('quality');
  });

  it('8: missing/failed judgment → abstain (production tier + abstain reason)', () => {
    const policy = new CapabilityRoutingPolicyV1();
    const out = policy.evaluate(
      rec({
        judgment: null,
        decisionFailure: { reason: 'network_error', attemptCount: 3, latencyMs: 2100 },
      }),
    );
    expect(out.tier).toBe('quality');
    expect(out.reasonCodes).toContain('abstain_missing_judgment');
  });

  it('9: no root confidence / global threshold leaks into the replay contracts', () => {
    for (const f of ['replay/kernel.ts', 'replay/metrics.ts', 'replay/types.ts', 'policies/routing/capabilityPolicyV1.ts']) {
      const src = readFileSync(join(__dirname, '../../lib/intelligence/decision', f), 'utf8');
      expect(src).not.toMatch(/rootConfidence|overallConfidence|confidence\s*</);
    }
  });

  it('10: tier comparison uses ONE explicit rank table', () => {
    expect(TIER_RANK).toEqual({ fast: 0, quality: 1, reasoning: 2 });
    expect(tierDelta('reasoning', 'fast')).toBe('hypothetical_lower');
    expect(tierDelta('fast', 'reasoning')).toBe('hypothetical_higher');
    expect(tierDelta('quality', 'quality')).toBe('same');
  });

  it('11: script defaults force questionSetVersion=2 and tierPolicyVersion=2', () => {
    const src = readFileSync(join(__dirname, '../../scripts/decision-routing-replay.ts'), 'utf8');
    // Defaults live in parseArgs; never silently mix cohorts.
    expect(src).toMatch(/questionSet:\s*2, tierPolicy:\s*2/);
  });

  it('12: results are isolated by policyId + policyVersion', () => {
    const policy = new CapabilityRoutingPolicyV1();
    const r = replay(datasetOf([rec()]), [policy]);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].policyId).toBe('routing-capability-v1');
    expect(r.results[0].policyVersion).toBe('1');
    expect(typeof r.results[0].resultHash).toBe('string');
  });

  it('13: replay never mutates historical production route', () => {
    const policy = new CapabilityRoutingPolicyV1();
    const input = rec({ production: { intent: 'coding_task', tier: 'quality', modelRefs: ['gemini.quality'] } });
    const before = JSON.parse(JSON.stringify(input));
    replay(datasetOf([input]), [policy]);
    expect(input).toEqual(before);
  });

  it('14: replay kernel carries no Supabase or network imports', () => {
    for (const f of ['replay/kernel.ts', 'replay/metrics.ts', 'replay/normalize.ts', 'replay/types.ts', 'policies/routing/capabilityPolicyV1.ts', 'policies/routing/types.ts']) {
      const src = readFileSync(join(__dirname, '../../lib/intelligence/decision', f), 'utf8');
      expect(src).not.toMatch(/from ['"]@\/lib\/supabaseClient|from ['"]\.\.\/\.\.\/\.\.\/supabaseClient|supabaseAdmin|fetch\(|axios|undici/);
    }
  });

  it('15: counterfactual labels stay descriptive — "hypothetical_*", never "over/under"', () => {
    const metricSrc = readFileSync(join(__dirname, '../../lib/intelligence/decision/replay/metrics.ts'), 'utf8');
    const kernelSrc = readFileSync(join(__dirname, '../../lib/intelligence/decision/replay/kernel.ts'), 'utf8');
    expect(metricSrc).not.toMatch(/over_provisioned|under_provisioned|overprovisioned|underprovisioned/);
    expect(kernelSrc).not.toMatch(/wouldHaveSucceeded|would_have_succeeded/);
    expect(tierDelta('reasoning', 'fast')).toBe('hypothetical_lower');
  });

  it('16: normalizeRows tags the experiment cohort so gen-0 and v2 cannot silently mix', () => {
    const gen0Shadow = {
      event_type: 'jev_shadow_decision',
      metadata: {
        requestId: 'g1',
        status: 'ok',
        productionIntent: 'coding_task',
        productionTier: 'quality',
        productionModelRef: 'gemini.quality',
        decisionPlaneSchemaVersion: 1,
        questionSetVersion: 1,
        tierPolicyVersion: 1,
        proposedCapability: 'quality',
        decisionModel: 'jev-1.13.0',
      },
    };
    const v2Shadow = {
      event_type: 'jev_shadow_decision',
      metadata: {
        requestId: 'v1',
        status: 'ok',
        productionIntent: 'coding_task',
        productionTier: 'quality',
        productionModelRef: 'gemini.quality',
        decisionPlaneSchemaVersion: 1,
        questionSetVersion: 2,
        tierPolicyVersion: 2,
        proposedCapability: 'reasoning',
        decisionModel: 'jev-1.13.0',
      },
    };
    const ucolGen0 = [{ request_id: 'g1', outcome: 'success' as const, latency_ms: 1, estimated_cost_usd: 0, user_correction_signal: 'none' as const }];
    const ucolV2 = [{ request_id: 'v1', outcome: 'success' as const, latency_ms: 1, estimated_cost_usd: 0, user_correction_signal: 'none' as const }];

    const gen0 = normalizeRows([gen0Shadow], ucolGen0);
    const v2 = normalizeRows([v2Shadow], ucolV2);

    expect(gen0[0].experiment.questionSetVersion).toBe(1);
    expect(gen0[0].experiment.tierPolicyVersion).toBe(1);
    expect(v2[0].experiment.questionSetVersion).toBe(2);
    expect(v2[0].experiment.tierPolicyVersion).toBe(2);
    // The dataset-level hash differs — the cohorts cannot silently mix.
    expect(datasetOf(gen0).datasetHash).not.toBe(datasetOf(v2).datasetHash);
  });

  it('normalizeRows routes failed judgments to decisionFailure, keeping them in the denominator', () => {
    const rows = normalizeRows(
      [
        {
          event_type: 'jev_shadow_decision',
          metadata: {
            requestId: 'f1',
            status: 'unavailable',
            jevFailureReason: 'response_invalid',
            jevAttemptCount: 2,
            jevLatencyMs: 900,
            productionIntent: 'coding_task',
            productionTier: 'quality',
            productionModelRef: 'gemini.quality',
            decisionPlaneSchemaVersion: 1,
            questionSetVersion: 2,
            tierPolicyVersion: 2,
          },
        },
      ],
      [{ request_id: 'f1', outcome: 'success' as const }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].judgment).toBeNull();
    expect(rows[0].decisionFailure?.reason).toBe('response_invalid');
    expect(rows[0].decisionFailure?.attemptCount).toBe(2);
  });
});
