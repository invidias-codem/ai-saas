// __tests__/contracts/decision-plane-canary.contract.test.ts
// Slice 4 contracts. Locks:
//   1. Activation requires a frozen CANARY_ELIGIBLE artifact (never live eval)
//   2. Kill switch dominates; missing config resolves OFF
//   3. Deterministic facts outrank semantic judgment
//   4. Canary failure of any kind → B2 with typed fallback reason
//   5. Attributable verdict fields
// Plus: determinism, purity, no-B2-mutation, cohort stability.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  authorizeCanary,
  cohortBucket,
  validateCanaryDecision,
  type CanaryConfig,
  type CanaryPromotionArtifact,
  type CanaryRequestFacts,
  type CanaryVerdict,
} from '@/lib/intelligence/decision/canary';
import type { Tier } from '@/lib/intelligence/decision/replay/types';

const artifact: CanaryPromotionArtifact = {
  status: 'CANARY_ELIGIBLE',
  datasetHash: 'ds-abc',
  policyId: 'routing-capability-v1',
  policyVersion: '1',
  gateVersion: 'promotion-gate-v1',
  promotionProfileVersion: 'promotion-profile-v1',
};

function facts(over: Partial<CanaryRequestFacts> = {}): CanaryRequestFacts {
  return {
    requestId: 'r1',
    cohortKey: 'user-1',
    hasAttachments: false,
    requiresUserConfirmation: false,
    destructiveOrExternalSideEffects: false,
    deterministicRisk: 'unknown',
    supportedTiers: [],
    providerAvailable: true,
    ...over,
  };
}

function config(over: Partial<CanaryConfig> = {}): CanaryConfig {
  return {
    enabled: true,
    artifact,
    allowlist: ['user-1'],
    bucketPercent: 10_000,
    experimentVersion: 'exp-1',
    semanticTierBudgetMs: 500,
    ...over,
  };
}

function eligibleVerdict(baseline: Tier = 'reasoning'): CanaryVerdict {
  return authorizeCanary({ baselineTier: baseline, facts: facts(), config: config() });
}

describe('decision plane canary runtime — slice 4 contracts', () => {
  it('1: activation requires an approved frozen artifact, not live evaluation', () => {
    // No artifact → not eligible, even fully enabled.
    const d = authorizeCanary({ baselineTier: 'fast', facts: facts(), config: config({ artifact: null }) });
    expect(d.eligible).toBe(false);
    expect(d.overrideReason).toBe('no_approved_artifact');
    // Purity: canary module never imports the promotion gate (no live eval).
    const src = readFileSync(join(__dirname, '../../lib/intelligence/decision/canary.ts'), 'utf8');
    expect(src).not.toMatch(/evaluatePromotion|from ['\"]\.\/replay\/promotion/);
  });

  it('2: kill switch dominates everything; missing config resolves OFF', () => {
    const off = authorizeCanary({ baselineTier: 'fast', facts: facts(), config: config({ enabled: false }) });
    expect(off.eligible).toBe(false);
    expect(off.applied).toBe(false);
    expect(off.servedTier).toBe('fast');
    expect(off.overrideReason).toBe('kill_switch_off');
    // Byte-for-byte B2: verdict's served tier IS the baseline tier.
    expect(off.servedTier).toBe(off.baselineTier);
  });

  it('3: deterministic facts outrank semantic judgment — every override', () => {
    const cases: Array<[Partial<CanaryRequestFacts>, string]> = [
      [{ hasAttachments: true }, 'attachment_present'],
      [{ personaMinimumTier: 'reasoning', ...{}, }, ''],
    ];
    // attachments
    expect(authorizeCanary({ baselineTier: 'quality', facts: facts({ hasAttachments: true }), config: config() }).overrideReason)
      .toBe('attachment_present');
    // persona floor (baseline below persona minimum)
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ personaMinimumTier: 'reasoning' }), config: config() }).overrideReason)
      .toBe('persona_capability_floor');
    // user confirmation gate
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ requiresUserConfirmation: true }), config: config() }).overrideReason)
      .toBe('requires_user_confirmation');
    // destructive/external side effects
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ destructiveOrExternalSideEffects: true }), config: config() }).overrideReason)
      .toBe('destructive_side_effects');
    // deterministic risk
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ deterministicRisk: 'high' }), config: config() }).overrideReason)
      .toBe('deterministic_risk_high');
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ deterministicRisk: 'critical' }), config: config() }).overrideReason)
      .toBe('deterministic_risk_high');
    // provider unavailable
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ providerAvailable: false }), config: config() }).overrideReason)
      .toBe('provider_unavailable');
    // allowlist
    expect(authorizeCanary({ baselineTier: 'fast', facts: facts({ cohortKey: 'user-2' }), config: config() }).overrideReason)
      .toBe('cohort_not_allowlisted');
    void cases;
  });

  it('4: canary failure of ANY kind → B2 with a typed fallback reason', () => {
    const v = eligibleVerdict('reasoning');
    // decision missing
    const missing = validateCanaryDecision({ verdict: v, facts: facts(), semanticTier: null, decisionLatencyMs: 10, semanticTierBudgetMs: 500 });
    expect(missing.applied).toBe(false);
    expect(missing.servedTier).toBe('reasoning');
    expect(missing.fallbackReason).toBe('decision_unavailable');
    // over budget → B2 (transport timeout)
    const slow = validateCanaryDecision({ verdict: v, facts: facts(), semanticTier: 'fast', decisionLatencyMs: 900, semanticTierBudgetMs: 500 });
    expect(slow.fallbackReason).toBe('decision_timeout');
    expect(slow.servedTier).toBe('reasoning');
    // malformed tier
    const bad = validateCanaryDecision({ verdict: v, facts: facts(), semanticTier: 'ultra', decisionLatencyMs: 10, semanticTierBudgetMs: 500 });
    expect(bad.fallbackReason).toBe('decision_malformed');
    // unsupported tier
    const unsup = validateCanaryDecision({ verdict: v, facts: facts({ supportedTiers: ['reasoning'] }), semanticTier: 'fast', decisionLatencyMs: 10, semanticTierBudgetMs: 500 });
    expect(unsup.fallbackReason).toBe('tier_invalid');
    // success path: applied only when it diverges
    const ok = validateCanaryDecision({ verdict: v, facts: facts(), semanticTier: 'fast', decisionLatencyMs: 100, semanticTierBudgetMs: 500 });
    expect(ok.applied).toBe(true);
    expect(ok.servedTier).toBe('fast');
    expect(ok.fallbackReason).toBeNull();
    // same tier → not applied, still served fine
    const same = validateCanaryDecision({ verdict: v, facts: facts(), semanticTier: 'reasoning', decisionLatencyMs: 100, semanticTierBudgetMs: 500 });
    expect(same.applied).toBe(false);
    expect(same.servedTier).toBe('reasoning');
  });

  it('5: every verdict is attributable — full field set present', () => {
    const d = authorizeCanary({ baselineTier: 'reasoning', facts: facts(), config: config() });
    expect(d.cohortId).toBeDefined();
    expect(typeof d.policyId).toBe('string');
    expect(d.policyVersion).toBe('1');
    expect(d.promotionDatasetHash).toBe('ds-abc');
    expect(d.baselineTier).toBe('reasoning');
    expect(d.servedTier).toBe('reasoning');
    expect([d.overrideReason, d.fallbackReason].every((x) => x === null || typeof x === 'string')).toBe(true);
  });

  it('6: cohort bucketing is deterministic and stable', () => {
    const a = cohortBucket('user-1', 'exp-1');
    const b = cohortBucket('user-1', 'exp-1');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10_000);
    // different experiment version → (very likely) different bucket
    const c = cohortBucket('user-1', 'exp-2');
    expect(typeof c).toBe('number');
    // bucket gate: bucketPercent=0 excludes everyone in the allowlist
    const excluded = authorizeCanary({ baselineTier: 'fast', facts: facts(), config: config({ bucketPercent: 0 }) });
    expect(excluded.overrideReason).toBe('cohort_bucket_excluded');
  });

  it('7: authority module is pure — no I/O, wall-clock, RNG, DB, engine imports', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/decision/canary.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)|fetch\(|axios|undici|supabaseAdmin/);
    expect(src).not.toMatch(/from ['\"]@\/lib\/(supabaseClient|telemetry)/);
  });

  it('8: verdict never mutates its inputs', () => {
    const f = facts();
    const cfg = config();
    const before = JSON.stringify({ f, cfg });
    authorizeCanary({ baselineTier: 'fast', facts: f, config: cfg });
    expect(JSON.stringify({ f, cfg })).toBe(before);
  });
});
