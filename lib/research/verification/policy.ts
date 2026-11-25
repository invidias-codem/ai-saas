// lib/research/verification/policy.ts
// Research Plane — R0 verification policy evaluation. Pure, no I/O.

import type { VerificationPolicy } from '../contracts';

export function isAxiomAuthorized(
  policy: VerificationPolicy,
  axiom: string,
): boolean {
  // sorryAx is always denied
  if (axiom === 'sorryAx') return false;
  // explicitly denied takes priority
  if (policy.disallowedAxioms.includes(axiom)) return false;
  // must be in allowlist
  if (policy.allowedAxioms.length > 0) {
    return policy.allowedAxioms.includes(axiom);
  }
  // empty allowlist rejects everything
  return false;
}

export function allRequiredChecksPassed(
  policy: VerificationPolicy,
  checkResults: Record<string, { passed?: boolean; reason?: string }>,
): boolean {
  for (const check of policy.requiredChecks) {
    if (checkResults[check]?.passed !== true) {
      return false;
    }
  }
  return true;
}

export type VerificationOutcome = 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE';

export interface DetermineOutcomeInput {
  policy: VerificationPolicy;
  checkResults: Record<string, { passed?: boolean; reason?: string }>;
  exitStatus: number;
  disallowedAxiomsUsed: string[];
  placeholdersPresent: boolean;
  timeoutExceeded: boolean;
}

export function determineOutcome(input: DetermineOutcomeInput): VerificationOutcome {
  const { policy, checkResults, exitStatus, disallowedAxiomsUsed, placeholdersPresent, timeoutExceeded } = input;

  if (timeoutExceeded) {
    return 'INCONCLUSIVE';
  }
  if (disallowedAxiomsUsed.length > 0) {
    return 'FAILED';
  }
  if (placeholdersPresent) {
    return 'FAILED';
  }
  if (exitStatus !== 0) {
    return 'FAILED';
  }
  if (!allRequiredChecksPassed(policy, checkResults)) {
    return 'FAILED';
  }
  return 'VERIFIED';
}

export function detectArtifactTampering(
  expectedHash: string,
  actualHash: string,
): { tampered: boolean } {
  return { tampered: expectedHash !== actualHash };
}

export function validateReceiptConsistency(
  policy: VerificationPolicy,
  outcome: string,
  checkResults: Record<string, { passed?: boolean; reason?: string }>,
): { consistent: boolean; reason?: string } {
  if (outcome === 'VERIFIED' && !allRequiredChecksPassed(policy, checkResults)) {
    return { consistent: false, reason: 'checks failed' };
  }
  return { consistent: true };
}
