// lib/engineering-evidence/contracts.ts
// EI-4D: Engineering evidence claim contracts.
//
// Pure contracts: no I/O, no network, no provider SDKs. Deterministic.
// Reuses Research Plane hashing utilities (canonicalizeJson, sha256Json)
// from lib/research/contracts.ts — no redundant infrastructure.
//
// Security rule: an implementation agent may submit evidence but cannot
// authorize its own transition to SECURITY_QUALIFIED. That requires a
// different verifierIdentity.

import { canonicalizeJson, sha256Json } from '@/lib/research/contracts';
import { z } from 'zod';

// ── Acceptance states ──────────────────────────────────────────────────────

export const AcceptanceStatusSchema = z.enum([
  'DOCUMENTED',
  'SOURCE_OBSERVED',
  'IMPLEMENTED',
  'COMPILED',
  'BEHAVIOR_VERIFIED',
  'SECURITY_QUALIFIED',
  'PARTIAL',
  'BLOCKED',
  'CONTRADICTED',
]);
export type AcceptanceStatus = z.infer<typeof AcceptanceStatusSchema>;

const FORWARD_TRANSITIONS: Record<AcceptanceStatus, AcceptanceStatus[]> = {
  DOCUMENTED: ['SOURCE_OBSERVED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'],
  SOURCE_OBSERVED: ['IMPLEMENTED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'],
  IMPLEMENTED: ['COMPILED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'],
  COMPILED: ['BEHAVIOR_VERIFIED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'],
  BEHAVIOR_VERIFIED: ['SECURITY_QUALIFIED', 'PARTIAL', 'BLOCKED', 'CONTRADICTED'],
  SECURITY_QUALIFIED: [], // terminal
  PARTIAL: ['IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED', 'BLOCKED', 'CONTRADICTED'],
  BLOCKED: ['DOCUMENTED', 'SOURCE_OBSERVED', 'IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED', 'CONTRADICTED'],
  CONTRADICTED: ['DOCUMENTED', 'SOURCE_OBSERVED', 'IMPLEMENTED', 'COMPILED', 'BEHAVIOR_VERIFIED', 'SECURITY_QUALIFIED'],
};

// ── Engineering claim contract ─────────────────────────────────────────────

export const EngineeringClaimSchema = z.object({
  claimId: z.string().uuid(),
  targetIdentity: z.string().min(1), // e.g. 'Windows named-pipe IPC transport'
  repository: z.string().min(1), // e.g. 'invidias-codem/ai-saas'
  commitSha: z.string().min(1).max(64), // git commit SHA
  sourcePath: z.string().min(1), // file path relative to repo root
  sourceRange: z
    .object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() })
    .optional(),
  securityInvariant: z.string().min(1), // e.g. 'fail-closed authentication'
  enforcementPath: z.string().min(1), // e.g. 'validate_auth_token -> nonce_tracker.validate_challenge'
  verificationCommand: z.string().min(1), // e.g. 'cargo test --features windows-ipc'
  testIdentity: z.string().min(1), // e.g. 'test_nonce_replay_rejected'
  verificationEnvironment: z.string().min(1), // e.g. 'macOS cargo 1.99 / Windows CI MSVC'
  observedResult: z.string().min(1), // e.g. '19/19 tests pass'
  artifactDigest: z.string().min(1), // sha256 of canonical claim + evidence
  coverageLimitations: z.array(z.string()).min(1), // what is NOT covered
  verifierIdentity: z.string().min(1), // who performed verification (not the implementer)
  contradictoryEvidence: z.array(z.string()).default([]), // observations that conflict
  acceptanceStatus: AcceptanceStatusSchema.default('DOCUMENTED'),
});

export type EngineeringClaim = z.infer<typeof EngineeringClaimSchema>;

// ── Claim digest ───────────────────────────────────────────────────────────

/**
 * Compute the canonical artifact digest for an engineering claim. The digest
 * binds every field except `artifactDigest` itself and `contradictoryEvidence`
 * (which is mutable metadata about conflicting observations).
 */
export function claimDigest(claim: EngineeringClaim): string {
  const { artifactDigest, contradictoryEvidence, ...rest } = claim;
  return sha256Json(rest);
}

/** Seal a claim: compute its artifactDigest and mark it sealed. */
export function sealClaim(claim: EngineeringClaim): EngineeringClaim {
  return { ...claim, artifactDigest: claimDigest(claim) };
}

/** Verify that a claim's artifactDigest matches its canonical content. */
export function verifyClaimDigest(claim: EngineeringClaim): { readonly valid: boolean; readonly reason?: string } {
  const expected = claimDigest(claim);
  if (claim.artifactDigest !== expected) {
    return { valid: false, reason: `artifact digest mismatch: expected ${expected}, got ${claim.artifactDigest}` };
  }
  return { valid: true };
}

// ── Canonical serialization for storage/transmission ───────────────────────

export function serializeClaim(claim: EngineeringClaim): string {
  return canonicalizeJson(claim);
}

export function deserializeClaim(json: string): EngineeringClaim {
  return EngineeringClaimSchema.parse(JSON.parse(json));
}
