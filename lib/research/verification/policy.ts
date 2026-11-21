// Research Plane — R0: Verification policy and trust boundaries.
//
// Defines what counts as a valid verification, which axioms are authorized,
// and how tampering is detected. Pure: no I/O.

import type { VerificationPolicy } from '@/lib/research/contracts';
import { ResearchPlaneError } from '@/lib/research/contracts';

/**
 * Check whether an axiom is authorized under the policy.
 * Requires both: explicitly allowed AND not explicitly denied.
 * sorryAx is always denied (marks incomplete/provisional proofs).
 */
export function isAxiomAuthorized(
  policy: VerificationPolicy,
  axiom: string,
): boolean {
  return (
    axiom !== 'sorryAx' &&
    policy.allowedAxioms.includes(axiom) &&
    !policy.disallowedAxioms.includes(axiom)
  );
}

/**
 * Validate that all required checks passed in a verification result.
 * Returns false (never throws) so callers decide how to handle failure.
 */
export function allRequiredChecksPassed(
  policy: VerificationPolicy,
  checkResults: Record<string, { passed: boolean; reason?: string }>,
): boolean {
  for (const check of policy.requiredChecks) {
    const result = checkResults[check];
    if (!result || !result.passed) return false;
  }
  return true;
}

/**
 * Determine the verification outcome from check results and policy.
 * A result is VERIFIED only when all required checks pass and no
 * disallowed axioms or placeholders are present.
 */
export function determineOutcome(input: {
  policy: VerificationPolicy;
  checkResults: Record<string, { passed: boolean; reason?: string }>;
  exitStatus: number;
  disallowedAxiomsUsed: string[];
  placeholdersPresent: boolean;
  timeoutExceeded: boolean;
}): 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE' {
  // Timeout or interruption → INCONCLUSIVE, never VERIFIED.
  if (input.timeoutExceeded) return 'INCONCLUSIVE';

  // Disallowed axiom or placeholder → FAILED (tampering or unsoundness).
  if (input.disallowedAxiomsUsed.length > 0) return 'FAILED';
  if (input.placeholdersPresent) return 'FAILED';

  // Non-zero exit → FAILED.
  if (input.exitStatus !== 0) return 'FAILED';

  // All required checks must pass.
  if (!allRequiredChecksPassed(input.policy, input.checkResults)) return 'FAILED';

  return 'VERIFIED';
}

/**
 * Detect artifact tampering by comparing expected vs actual content hash.
 */
export function detectArtifactTampering(
  expectedHash: string,
  actualHash: string,
): { readonly tampered: boolean; readonly reason?: string } {
  if (expectedHash !== actualHash) {
    return { tampered: true, reason: 'content hash mismatch' };
  }
  return { tampered: false };
}

/**
 * Verify that a receipt's outcome is consistent with its check results.
 * A receipt claiming VERIFIED with failing checks is inconsistent.
 */
export function validateReceiptConsistency(
  policy: VerificationPolicy,
  receiptOutcome: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE' | 'REJECTED',
  checkResults: Record<string, { passed: boolean; reason?: string }>,
): { readonly consistent: boolean; readonly reason?: string } {
  const allPassed = allRequiredChecksPassed(policy, checkResults);
  if (receiptOutcome === 'VERIFIED' && !allPassed) {
    return {
      consistent: false,
      reason: 'receipt claims VERIFIED but required checks failed',
    };
  }
  return { consistent: true };
}
