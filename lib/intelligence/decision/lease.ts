// lib/intelligence/decision/lease.ts
// Slice 5: Route leases + decision cache identity. PURE — no I/O, wall-clock
// reads, RNG, network, or DB. The caller owns storage and timestamps; this
// module answers ONE question: may a previously validated routing judgment
// be reused without calling the decision transport again?
//
// Reuse rule (strict, no best-effort stale reuse):
//   policy version unchanged
// AND state fingerprint still matches
// AND lease horizon permits reuse
// AND no invalidation signal fired
// AND deterministic Constitution still allows it
// Otherwise: invalidate → reobserve → transport or B2.
//
// Cache identity binds the FULL decision context, not the prompt:
//   hash(policyVersion + questionSetVersion + normalizedDossier
//        + deterministicPolicyContext + candidateSet)
// so a valid judgment can never be replayed into a materially different
// world state.

import type { DecisionLease } from './contracts';
import type { Tier, Effort } from './replay/types';

export const LEASE_GATE_VERSION = 'lease-authority-v1';

export type LeaseKind = DecisionLease; // 'one_call' | 'tool_chain' | 'user_turn'

export interface LeaseInvalidation {
  providerFailure?: boolean;
  toolSequenceChanged?: boolean;
  routeChanged?: boolean;
  compactionOccurred?: boolean;
  stateChanged?: boolean;
  taskCompleted?: boolean;
  newUserTurn?: boolean;
}

export interface DecisionLeaseRecord {
  leaseId: string;
  requestId: string;
  policyId: string;
  policyVersion: string;
  /** Cache key — context-bound, never prompt-only. */
  decisionFingerprint: string;
  /** Fingerprint of the world state the judgment was made against. */
  stateFingerprint: string;
  kind: LeaseKind;
  proposedTier: Tier;
  proposedEffort?: Effort;
  issuedAt: string;
  expiresAt?: string;
  /** Remaining executions for one_call/tool_chain; user_turn = unbounded. */
  remainingUses?: number;
  invalidation: LeaseInvalidation;
}

export type LeaseDisposition =
  | 'lease_hit'        // valid → reuse judgment, skip transport
  | 'lease_consumed'   // valid but this use exhausts it
  | 'lease_miss'       // no lease existed for this context
  | 'lease_expired'    // horizon passed
  | 'lease_invalidated'; // an invalidation signal fired

export interface LeaseCheckResult {
  disposition: LeaseDisposition;
  lease: DecisionLeaseRecord | null;
  /** Set when disposition is not lease_hit/lease_consumed. */
  invalidationReasons: string[];
  /** The tier the caller may reuse, null when it must reobserve. */
  reusableTier: Tier | null;
}

/**
 * Context-bound cache key. Binds the full decision context — policy
 * version, question-set version, normalized dossier, deterministic policy
 * context, candidate set — so identical prompts in different worlds never
 * collide. The caller passes canonicalized strings; this just binds and
 * hashes them.
 */
export function leaseFingerprint(parts: {
  policyVersion: string;
  questionSetVersion: number;
  normalizedDossier: string;
  deterministicPolicyContext: string;
  candidateSet: string;
}): string {
  // Delimiter-proof: canonical() output contains its own structure; the
  // JSON.stringify wrapper prevents field-boundary injection.
  const payload = JSON.stringify([
    parts.policyVersion,
    parts.questionSetVersion,
    parts.normalizedDossier,
    parts.deterministicPolicyContext,
    parts.candidateSet,
  ]);
  // ponytail: plain djb2 over the payload is enough for in-memory lease
  // identity (collision = one wasted reobservation, never a wrong route:
  // a colliding miss re-runs transport). Swap for sha256 if leases ever
  // become durable/shared across processes.
  let h = 5381;
  for (let i = 0; i < payload.length; i += 1) {
    h = ((h * 33) ^ payload.charCodeAt(i)) >>> 0;
  }
  return `lease_${h.toString(16)}`;
}

function invalidationReasons(inv: LeaseInvalidation): string[] {
  const reasons: string[] = [];
  if (inv.providerFailure) reasons.push('provider_failure');
  if (inv.toolSequenceChanged) reasons.push('tool_sequence_changed');
  if (inv.routeChanged) reasons.push('route_changed');
  if (inv.compactionOccurred) reasons.push('compaction_occurred');
  if (inv.stateChanged) reasons.push('state_changed');
  if (inv.taskCompleted) reasons.push('task_completed');
  if (inv.newUserTurn) reasons.push('new_user_turn');
  return reasons;
}

/**
 * LEASE AUTHORITY — may this lease be reused? Pure. The caller supplies
 * `now` (ISO) so the check stays deterministic and testable.
 */
export function checkLease(args: {
  lease: DecisionLeaseRecord | null;
  /** Current context fingerprints — mismatch = different world. */
  decisionFingerprint: string;
  stateFingerprint: string;
  policyVersion: string;
  now: string;
}): LeaseCheckResult {
  const { lease, decisionFingerprint, stateFingerprint, policyVersion, now } = args;

  if (!lease) {
    return { disposition: 'lease_miss', lease: null, invalidationReasons: [], reusableTier: null };
  }

  // Policy changed → the judgment was made under a different regime.
  if (lease.policyVersion !== policyVersion) {
    return {
      disposition: 'lease_invalidated',
      lease,
      invalidationReasons: ['policy_version_changed'],
      reusableTier: null,
    };
  }

  // Context mismatch → materially different world; never replay.
  if (lease.decisionFingerprint !== decisionFingerprint || lease.stateFingerprint !== stateFingerprint) {
    return {
      disposition: 'lease_invalidated',
      lease,
      invalidationReasons: [lease.decisionFingerprint !== decisionFingerprint ? 'decision_context_changed' : 'state_fingerprint_changed'],
      reusableTier: null,
    };
  }

  // Any invalidation signal fired → no best-effort reuse.
  const fired = invalidationReasons(lease.invalidation);
  if (fired.length > 0) {
    return { disposition: 'lease_invalidated', lease, invalidationReasons: fired, reusableTier: null };
  }

  // Horizon: expiry (wall-clock owned by caller).
  if (lease.expiresAt && now >= lease.expiresAt) {
    return { disposition: 'lease_expired', lease, invalidationReasons: ['horizon_elapsed'], reusableTier: null };
  }

  // Use budget: one_call and tool_chain are finite.
  if (lease.remainingUses !== undefined && lease.remainingUses <= 0) {
    return { disposition: 'lease_invalidated', lease, invalidationReasons: ['uses_exhausted'], reusableTier: null };
  }

  const consumes = lease.kind === 'one_call' || lease.remainingUses !== undefined;
  return {
    disposition: consumes ? 'lease_consumed' : 'lease_hit',
    lease,
    invalidationReasons: [],
    reusableTier: lease.proposedTier,
  };
}

/**
 * Consume one use of a valid lease. Returns the updated record; the caller
 * owns storage. Pure: never mutates the input record.
 */
export function consumeLease(lease: DecisionLeaseRecord): DecisionLeaseRecord {
  if (lease.remainingUses === undefined) return lease;
  return { ...lease, remainingUses: Math.max(lease.remainingUses - 1, 0) };
}

/**
 * Issue a lease after a validated transport decision. Kind semantics:
 *   one_call   → 1 use, no expiry — consumed by the single execution attempt.
 *   tool_chain → N uses within one tool sequence; toolSequenceChanged kills it.
 *   user_turn  → unbounded uses within the active turn; newUserTurn kills it.
 * `now` supplied by caller; horizons are caller-configured.
 */
export function issueLease(args: {
  requestId: string;
  policyId: string;
  policyVersion: string;
  decisionFingerprint: string;
  stateFingerprint: string;
  kind: LeaseKind;
  proposedTier: Tier;
  proposedEffort?: Effort;
  now: string;
  expiresAt?: string;
  uses?: number;
}): DecisionLeaseRecord {
  return {
    leaseId: `${args.requestId}:${args.kind}`,
    requestId: args.requestId,
    policyId: args.policyId,
    policyVersion: args.policyVersion,
    decisionFingerprint: args.decisionFingerprint,
    stateFingerprint: args.stateFingerprint,
    kind: args.kind,
    proposedTier: args.proposedTier,
    proposedEffort: args.proposedEffort,
    issuedAt: args.now,
    expiresAt: args.expiresAt,
    remainingUses: args.kind === 'one_call' ? 1 : args.uses,
    invalidation: {},
  };
}
