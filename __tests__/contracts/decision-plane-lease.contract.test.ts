// __tests__/contracts/decision-plane-lease.contract.test.ts
// Slice 5 contracts. Locks: strict reuse rule (no best-effort stale
// reuse), kind semantics, context-bound cache identity, purity,
// determinism, no input mutation, telemetry dispositions.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  checkLease,
  consumeLease,
  issueLease,
  leaseFingerprint,
  type DecisionLeaseRecord,
} from '@/lib/intelligence/decision/lease';

function lease(over: Partial<DecisionLeaseRecord> = {}): DecisionLeaseRecord {
  const { invalidation, remainingUses, expiresAt, ...issue } = over as Partial<DecisionLeaseRecord> & Record<string, unknown>;
  const base = issueLease({
    requestId: 'r1',
    policyId: 'routing-capability-v1',
    policyVersion: '1',
    decisionFingerprint: 'fp-decision',
    stateFingerprint: 'fp-state',
    kind: 'user_turn',
    proposedTier: 'fast',
    now: '2026-10-04T10:00:00Z',
    ...(issue as object),
  });
  return {
    ...base,
    ...(invalidation !== undefined ? { invalidation } : {}),
    ...(remainingUses !== undefined ? { remainingUses } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

describe('decision plane lease + cache — slice 5 contracts', () => {
  it('1: reuse ONLY when policy, context, state, horizon, and signals all hold', () => {
    const l = lease();
    // All hold → hit.
    const hit = checkLease({ lease: l, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(hit.disposition).toBe('lease_hit');
    expect(hit.reusableTier).toBe('fast');
    // Policy changed → invalidate, never reuse.
    const pol = checkLease({ lease: l, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '2', now: '2026-10-04T10:01:00Z' });
    expect(pol.disposition).toBe('lease_invalidated');
    expect(pol.invalidationReasons).toContain('policy_version_changed');
    // Context changed → invalidate.
    const ctx = checkLease({ lease: l, decisionFingerprint: 'fp-OTHER', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(ctx.disposition).toBe('lease_invalidated');
    expect(ctx.invalidationReasons).toContain('decision_context_changed');
    // State changed → invalidate.
    const st = checkLease({ lease: l, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-OTHER', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(st.disposition).toBe('lease_invalidated');
    expect(st.invalidationReasons).toContain('state_fingerprint_changed');
  });

  it('2: any invalidation signal kills the lease — no best-effort reuse', () => {
    for (const signal of ['providerFailure', 'toolSequenceChanged', 'routeChanged', 'compactionOccurred', 'stateChanged', 'taskCompleted', 'newUserTurn'] as const) {
      const l = lease({ invalidation: { [signal]: true } as DecisionLeaseRecord['invalidation'] });
      const r = checkLease({ lease: l, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
      expect(r.disposition).toBe('lease_invalidated');
      expect(r.reusableTier).toBeNull();
    }
  });

  it('3: expiry horizon and use budgets are enforced', () => {
    // Expired → lease_expired.
    const exp = lease({ expiresAt: '2026-10-04T10:00:30Z' });
    const r = checkLease({ lease: exp, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(r.disposition).toBe('lease_expired');
    // one_call: single-use → consumed on first use.
    const one = lease({ kind: 'one_call' });
    const c = checkLease({ lease: one, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(c.disposition).toBe('lease_consumed');
    const after = consumeLease(one);
    expect(after.remainingUses).toBe(0);
    const spent = checkLease({ lease: after, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(spent.disposition).toBe('lease_invalidated');
    expect(spent.invalidationReasons).toContain('uses_exhausted');
    // tool_chain: finite budget decrements.
    const chain = lease({ kind: 'tool_chain', remainingUses: 2 });
    const c2 = checkLease({ lease: chain, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(c2.disposition).toBe('lease_consumed');
    expect(consumeLease(chain).remainingUses).toBe(1);
    // user_turn: unbounded → pure hit, no decrement.
    const ut = lease(); // remainingUses undefined for user_turn
    const h = checkLease({ lease: ut, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' });
    expect(h.disposition).toBe('lease_hit');
    expect(consumeLease(ut)).toBe(ut); // untouched
  });

  it('4: cache identity binds full context, not the prompt', () => {
    const base = { policyVersion: '1', questionSetVersion: 2, normalizedDossier: 'd1', deterministicPolicyContext: 'p1', candidateSet: 'c1' };
    const a = leaseFingerprint(base);
    expect(a).toBe(leaseFingerprint(base)); // stable
    // Any component change → different key.
    expect(leaseFingerprint({ ...base, policyVersion: '2' })).not.toBe(a);
    expect(leaseFingerprint({ ...base, questionSetVersion: 3 })).not.toBe(a);
    expect(leaseFingerprint({ ...base, normalizedDossier: 'd2' })).not.toBe(a);
    expect(leaseFingerprint({ ...base, deterministicPolicyContext: 'p2' })).not.toBe(a);
    expect(leaseFingerprint({ ...base, candidateSet: 'c2' })).not.toBe(a);
  });

  it('5: miss → caller must reobserve (transport or B2)', () => {
    const r = checkLease({ lease: null, decisionFingerprint: 'x', stateFingerprint: 'y', policyVersion: '1', now: 'now' });
    expect(r.disposition).toBe('lease_miss');
    expect(r.reusableTier).toBeNull();
    expect(r.lease).toBeNull();
  });

  it('6: module is pure and inputs never mutated', () => {
    const src = readFileSync(join(__dirname, '../../lib/intelligence/decision/lease.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)|fetch\(|axios|supabaseAdmin/);
    const l = lease();
    const before = JSON.stringify(l);
    checkLease({ lease: l, decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: 't' });
    consumeLease(l);
    expect(JSON.stringify(l)).toBe(before);
  });

  it('7: deterministic — identical inputs, identical outputs', () => {
    const args = { lease: lease(), decisionFingerprint: 'fp-decision', stateFingerprint: 'fp-state', policyVersion: '1', now: '2026-10-04T10:01:00Z' } as const;
    expect(JSON.stringify(checkLease(args))).toBe(JSON.stringify(checkLease(args)));
  });
});
