// lib/intelligence/decision/canary.ts
// Slice 4: BOUNDED routing-canary authority. PURE — no I/O, no wall-clock,
// no RNG, no network, no DB. Given a request's deterministic facts and a
// frozen promotion artifact, decides whether an approved semantic policy is
// ALLOWED to replace the B2 baseline tier — and which tier wins otherwise.
//
// Invariants (contract-locked):
//   1. B2 is computed first elsewhere and passed in; this module NEVER
//      recomputes or mutates it. Fallback is always the untouched baseline.
//   2. Kill switch dominates: enabled !== true → byte-for-byte B2 behavior.
//   3. Activation requires a FROZEN artifact (approved after 3B), never a
//      live promotion-gate call against traffic.
//   4. Deterministic facts outrank semantic judgment (the executable
//      Constitution): attachments, persona floors, destructive/external
//      side effects, approval gates, deterministic risk → B2.
//   5. Canary failure of ANY kind → B2 with a typed fallback_b2_* reason.
//      No chained semantic fallback, ever.

import type { Tier } from './replay/types';

export const CANARY_GATE_VERSION = 'canary-authority-v1';

/** Frozen promotion artifact — produced by the 3B gate on a calibration-
 *  window-derived profile and explicitly written to config. Runtime NEVER
 *  runs the promotion gate against live traffic. */
export interface CanaryPromotionArtifact {
  status: 'CANARY_ELIGIBLE';
  datasetHash: string;
  policyId: string;
  policyVersion: string;
  gateVersion: string;
  promotionProfileVersion: string;
}

/** Deterministic facts extracted from the request by the caller — never
 *  derived from semantic judgment. */
export interface CanaryRequestFacts {
  requestId: string;
  /** Stable cohort key — userId or workspaceId. Same key → same cohort. */
  cohortKey: string;
  hasAttachments: boolean;
  /** Persona minimum tier — a capability FLOOR the canary may not undercut. */
  personaMinimumTier?: Tier;
  requiresUserConfirmation: boolean;
  destructiveOrExternalSideEffects: boolean;
  /** Deterministic risk from policyContext — outranks any semantic score. */
  deterministicRisk: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  /** Tiers the resolved provider supports for this call. Empty = unchecked. */
  supportedTiers: readonly Tier[];
  /** Provider for the proposed tier exists and is not rate-limited. */
  providerAvailable: boolean;
}

export interface CanaryConfig {
  enabled: boolean;
  artifact: CanaryPromotionArtifact | null;
  /** Explicit allowlist of cohortKeys admitted to the experiment. */
  allowlist: readonly string[];
  /** Percent of allowlisted cohorts admitted (deterministic bucket). 0-10000. */
  bucketPercent: number;
  experimentVersion: string;
  /** Deadline for the inline semantic call; over budget → B2. */
  semanticTierBudgetMs: number;
}

export type CanaryOverrideReason =
  | 'kill_switch_off'
  | 'no_approved_artifact'
  | 'cohort_not_allowlisted'
  | 'cohort_bucket_excluded'
  | 'attachment_present'
  | 'persona_capability_floor'
  | 'requires_user_confirmation'
  | 'destructive_side_effects'
  | 'deterministic_risk_high'
  | 'capability_unsupported'
  | 'provider_unavailable';

export type CanaryFallbackReason =
  | 'decision_unavailable'
  | 'decision_timeout'
  | 'decision_malformed'
  | 'tier_invalid'
  | 'decision_stale'
  | 'provider_mismatch'
  | 'policy_exception';

export interface CanaryVerdict {
  /** May the approved policy touch this request at all? */
  eligible: boolean;
  /** Did it actually change the served tier? */
  applied: boolean;
  cohortId: number;
  baselineTier: Tier;
  proposedTier: Tier | null;
  servedTier: Tier;
  overrideReason: CanaryOverrideReason | null;
  fallbackReason: CanaryFallbackReason | null;
  policyId: string | null;
  policyVersion: string | null;
  promotionDatasetHash: string | null;
}

const TIER_ORDER: Record<Tier, number> = { fast: 0, quality: 1, reasoning: 2 };

/** Deterministic cohort assignment — same key+experiment → same bucket.
 *  FNV-1a: we need stability, not cryptographic strength.
 *  ponytail: single-hash split; stratify by intent later if real traffic
 *  proves unbalanced. */
export function cohortBucket(cohortKey: string, experimentVersion: string): number {
  let h = 0x811c9dc5;
  const s = `${cohortKey}:${experimentVersion}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 10_000;
}

function isTier(v: unknown): v is Tier {
  return v === 'fast' || v === 'quality' || v === 'reasoning';
}

/**
 * CANARY AUTHORITY — pure eligibility. The caller supplies the B2 baseline
 * tier (already computed); this never mutates or recomputes it.
 */
export function authorizeCanary(args: {
  baselineTier: Tier;
  facts: CanaryRequestFacts;
  config: CanaryConfig;
}): CanaryVerdict {
  const { baselineTier, facts, config } = args;
  const cohortId = cohortBucket(facts.cohortKey, config.experimentVersion);

  const base = {
    cohortId,
    baselineTier,
    proposedTier: null,
    servedTier: baselineTier,
    fallbackReason: null as CanaryFallbackReason | null,
    policyId: config.artifact?.policyId ?? null,
    policyVersion: config.artifact?.policyVersion ?? null,
    promotionDatasetHash: config.artifact?.datasetHash ?? null,
  };

  // Kill switch dominates everything.
  if (!config.enabled) {
    return { ...base, eligible: false, applied: false, overrideReason: 'kill_switch_off' };
  }
  if (!config.artifact) {
    return { ...base, eligible: false, applied: false, overrideReason: 'no_approved_artifact' };
  }

  // Deterministic facts outrank semantic judgment — the executable
  // Constitution. Checked before any semantic tier is considered.
  if (facts.hasAttachments) {
    return { ...base, eligible: false, applied: false, overrideReason: 'attachment_present' };
  }
  if (facts.personaMinimumTier && TIER_ORDER[facts.personaMinimumTier] > TIER_ORDER[baselineTier]) {
    return { ...base, eligible: false, applied: false, overrideReason: 'persona_capability_floor' };
  }
  if (facts.requiresUserConfirmation) {
    return { ...base, eligible: false, applied: false, overrideReason: 'requires_user_confirmation' };
  }
  if (facts.destructiveOrExternalSideEffects) {
    return { ...base, eligible: false, applied: false, overrideReason: 'destructive_side_effects' };
  }
  if (facts.deterministicRisk === 'high' || facts.deterministicRisk === 'critical') {
    return { ...base, eligible: false, applied: false, overrideReason: 'deterministic_risk_high' };
  }
  // ponytail: supportedTiers only blocks a DOWNGRADE below the floor of
  // what the call needs; the proposed tier is checked in validate().
  if (!facts.providerAvailable) {
    return { ...base, eligible: false, applied: false, overrideReason: 'provider_unavailable' };
  }

  // Allowlist + deterministic bucket gate the experiment cohort.
  if (!config.allowlist.includes(facts.cohortKey)) {
    return { ...base, eligible: false, applied: false, overrideReason: 'cohort_not_allowlisted' };
  }
  if (cohortId >= config.bucketPercent) {
    return { ...base, eligible: false, applied: false, overrideReason: 'cohort_bucket_excluded' };
  }

  return { ...base, eligible: true, applied: false, overrideReason: null };
}

/**
 * DECISION VALIDATION — post-transport. Any failure → B2 with a typed
 * fallback_b2_* reason. No chained semantic fallback: baseline is the answer.
 */
export function validateCanaryDecision(args: {
  verdict: CanaryVerdict;
  facts: CanaryRequestFacts;
  semanticTier: unknown;
  decisionLatencyMs: number;
  semanticTierBudgetMs: number;
}): CanaryVerdict {
  const { verdict, facts, semanticTier, decisionLatencyMs } = args;
  const b2 = verdict.baselineTier;

  const fallback = (reason: CanaryFallbackReason, proposed: unknown): CanaryVerdict => ({
    ...verdict,
    eligible: true,
    applied: false,
    servedTier: b2,
    proposedTier: isTier(proposed) ? proposed : null,
    overrideReason: null,
    fallbackReason: reason,
  });

  // ponytail: 'decision_stale' arrives via the caller swapping a stale
  // marker in semanticTier; kept as a distinct reason for telemetry.
  if (semanticTier === 'stale') return fallback('decision_stale', null);
  if (semanticTier === null || semanticTier === undefined) {
    return fallback('decision_unavailable', null);
  }
  // Over budget → B2. The transport deadline enforces this first; this is
  // the defense-in-depth check that the verdict itself stays honest.
  if (!Number.isFinite(decisionLatencyMs) || decisionLatencyMs < 0) {
    return fallback('decision_malformed', semanticTier);
  }
  if (decisionLatencyMs > args.semanticTierBudgetMs) {
    return fallback('decision_timeout', semanticTier);
  }
  if (!isTier(semanticTier)) {
    return fallback('decision_malformed', semanticTier);
  }
  if (facts.supportedTiers.length > 0 && !facts.supportedTiers.includes(semanticTier)) {
    return fallback('tier_invalid', semanticTier);
  }

  // Eligible + valid: the approved proposal may be served. applied is true
  // only when it actually diverges from the immutable B2 baseline.
  return {
    ...verdict,
    eligible: true,
    applied: semanticTier !== b2,
    proposedTier: semanticTier,
    servedTier: semanticTier,
    overrideReason: null,
    fallbackReason: null,
  };
}
