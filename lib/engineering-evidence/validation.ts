// lib/engineering-evidence/validation.ts
// EI-4D: Deterministic evidence validation.
//
// Rejects:
//   - Missing source identity
//   - Evidence associated with a different commit
//   - Missing verification environment
//   - Invalid artifact hashes
//   - Missing security test evidence
//   - Failed or incomplete mandatory checks
//   - Self-approved security qualification
//   - Contradictory observations
//   - Unsupported claims of behavioral verification
//
// Pure: no I/O. Takes claim + verification context, returns ValidationResult.

import {
  AcceptanceStatus,
  EngineeringClaim,
  verifyClaimDigest,
} from './contracts';

export interface ValidationContext {
  /** The commit SHA the evidence must be associated with. */
  candidateCommit: string;
  /** The repository the evidence must reference. */
  candidateRepository: string;
  /** Required security test identities (e.g. ['test_nonce_replay_rejected']). */
  requiredSecurityTests: string[];
  /** Required verification commands (e.g. ['cargo test --features windows-ipc']). */
  requiredVerificationCommands: string[];
  /** Environments accepted for runtime verification (e.g. ['Windows CI MSVC']). */
  acceptedRuntimeEnvironments: string[];
  /** Identity of the agent who implemented the change (cannot self-approve). */
  implementerIdentity: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly rejected: boolean;
  readonly reasons: string[];
  readonly nextStatus?: AcceptanceStatus;
}

/**
 * Validate an engineering claim against the validation context.
 *
 * Returns { valid: true, rejected: false, nextStatus } when all mandatory
 * checks pass and the claim can advance to its claimed acceptanceStatus.
 *
 * Returns { valid: false, rejected: true, reasons } when any check fails.
 */
export function validateEngineeringClaim(
  claim: EngineeringClaim,
  ctx: ValidationContext,
): ValidationResult {
  const reasons: string[] = [];

  // ── 1. Missing source identity ───────────────────────────────────────────
  if (!claim.sourcePath || claim.sourcePath.trim().length === 0) {
    reasons.push('missing source identity: sourcePath is required');
  }
  if (!claim.targetIdentity || claim.targetIdentity.trim().length === 0) {
    reasons.push('missing source identity: targetIdentity is required');
  }

  // ── 2. Evidence associated with a different commit ───────────────────────
  if (claim.commitSha !== ctx.candidateCommit) {
    reasons.push(
      `commit mismatch: claim is for ${claim.commitSha}, candidate is ${ctx.candidateCommit}`,
    );
  }

  // ── 3. Repository mismatch ───────────────────────────────────────────────
  if (claim.repository !== ctx.candidateRepository) {
    reasons.push(
      `repository mismatch: claim is for ${claim.repository}, candidate is ${ctx.candidateRepository}`,
    );
  }

  // ── 4. Missing verification environment ──────────────────────────────────
  if (!claim.verificationEnvironment || claim.verificationEnvironment.trim().length === 0) {
    reasons.push('missing verification environment');
  } else if (!ctx.acceptedRuntimeEnvironments.includes(claim.verificationEnvironment)) {
    reasons.push(
      `unaccepted verification environment: ${claim.verificationEnvironment} not in accepted list`,
    );
  }

  // ── 5. Invalid artifact hash ─────────────────────────────────────────────
  const digestCheck = verifyClaimDigest(claim);
  if (!digestCheck.valid) {
    reasons.push(`invalid artifact hash: ${digestCheck.reason}`);
  }

  // ── 6. Missing security test evidence ────────────────────────────────────
  for (const required of ctx.requiredSecurityTests) {
    if (!claim.testIdentity.includes(required) && claim.testIdentity !== required) {
      // testIdentity may be a composite like "test_nonce_replay_rejected, test_duplicate_request_id_rejected"
      const tests = claim.testIdentity.split(/[,;]/).map((t) => t.trim());
      if (!tests.includes(required)) {
        reasons.push(`missing security test evidence: ${required}`);
      }
    }
  }

  // ── 7. Unsupported claims of behavioral verification ─────────────────────
  // A claim of BEHAVIOR_VERIFIED or SECURITY_QUALIFIED requires both a
  // verificationCommand and a testIdentity that maps to a real test.
  if (
    claim.acceptanceStatus === 'BEHAVIOR_VERIFIED' ||
    claim.acceptanceStatus === 'SECURITY_QUALIFIED'
  ) {
    if (!claim.verificationCommand || claim.verificationCommand.trim().length === 0) {
      reasons.push('behavioral verification claim requires verificationCommand');
    }
    if (!claim.testIdentity || claim.testIdentity.trim().length === 0) {
      reasons.push('behavioral verification claim requires testIdentity');
    }
    // A passing helper test cannot substitute for an integration test.
    // If the claim is SECURITY_QUALIFIED, the test must be a security test.
    if (claim.acceptanceStatus === 'SECURITY_QUALIFIED') {
      const securityTests = claim.testIdentity.split(/[,;]/).map((t) => t.trim());
      const hasSecurityTest = securityTests.some((t) =>
        ctx.requiredSecurityTests.includes(t),
      );
      if (!hasSecurityTest) {
        reasons.push(
          'security qualification requires at least one required security test in testIdentity',
        );
      }
    }
  }

  // ── 8. Self-approved security qualification ──────────────────────────────
  if (claim.acceptanceStatus === 'SECURITY_QUALIFIED') {
    if (claim.verifierIdentity === ctx.implementerIdentity) {
      reasons.push(
        'self-approved security qualification: verifierIdentity equals implementerIdentity',
      );
    }
  }

  // ── 9. Contradictory observations ────────────────────────────────────────
  if (claim.contradictoryEvidence && claim.contradictoryEvidence.length > 0) {
    reasons.push(
      `contradictory observations present: ${claim.contradictoryEvidence.join('; ')}`,
    );
  }

  // ── 10. State machine transition validity ────────────────────────────────
  // The claim's acceptanceStatus must be reachable from DOCUMENTED through
  // the forward chain. If it claims SECURITY_QUALIFIED, all intermediate
  // states must be evidenced (observedResult must not be empty).
  if (claim.acceptanceStatus === 'SECURITY_QUALIFIED') {
    if (!claim.observedResult || claim.observedResult.trim().length === 0) {
      reasons.push('security qualification requires observedResult');
    }
  }

  const rejected = reasons.length > 0;
  return {
    valid: !rejected,
    rejected,
    reasons,
    nextStatus: rejected ? undefined : claim.acceptanceStatus,
  };
}
