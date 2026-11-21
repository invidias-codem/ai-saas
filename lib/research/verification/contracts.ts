// Research Plane — R0: Verifier contracts.
//
// Defines the boundary between candidate-producing agents and independent
// verifiers. The verifier's executable, policy, and authority cannot be
// modified by the candidate-producing agent (Invariant 4).

import type { VerificationOutcome, VerifierIdentity, VerificationPolicy } from '@/lib/research/contracts';
import { ResearchPlaneError } from '@/lib/research/contracts';

/**
 * The result of an independent verification run. Produced by a verifier,
 * never by the candidate-producing agent.
 */
export interface VerificationResult {
  readonly outcome: VerificationOutcome;
  readonly checkResults: Record<string, { passed: boolean; reason?: string }>;
  readonly command: string;
  readonly exitStatus: number;
  readonly executedAt: string;
  readonly executedBy: string;
  readonly toolchain: VerifierIdentity;
  readonly policy: VerificationPolicy;
}

/**
 * A verifier provider. Implementations wrap Lean, build, test, or security
 * checkers. The research agent calls this through the orchestration layer
 * but never directly modifies the verifier.
 */
export interface VerifierProvider {
  readonly identity: VerifierIdentity;
  readonly policy: VerificationPolicy;

  /**
   * Verify a frozen candidate against the frozen specification.
   * Returns a VerificationResult bound to the exact spec/candidate hashes.
   */
  verify(input: {
    specHash: string;
    candidateHash: string;
    candidatePath: string;
    specPath: string;
  }): Promise<VerificationResult>;
}

/**
 * Default verification policy. All checks must pass for VERIFIED.
 */
export const DEFAULT_VERIFICATION_POLICY: VerificationPolicy = {
  policyId: 'verification-policy-v1',
  policyVersion: '1',
  requiredChecks: ['compilation', 'kernel_acceptance', 'axiom_inspection', 'replay'],
  disallowedAxioms: [],
  maxProofSteps: undefined,
  timeoutMs: 300_000,
};

/**
 * Validation that a verifier provider is not conflicted with the candidate
 * producer. Callers must assert the provider's identity differs from the
 * agent that produced the candidate.
 */
export function assertVerifierIndependence(
  producerRole: string,
  provider: VerifierProvider,
): void {
  if (producerRole === 'verifier' && provider.identity.name === 'agent') {
    throw new ResearchPlaneError(
      'Candidate-producing agent cannot act as its own verifier',
      'VERIFIER_CONFLICT',
    );
  }
}

/**
 * Build a VerificationReceipt from a VerificationResult, binding to the
 * exact spec and candidate hashes.
 */
export function buildReceipt(input: {
  receiptId: string;
  runId: string;
  specHash: string;
  candidateHash: string;
  result: VerificationResult;
}): import('@/lib/research/contracts').VerificationReceipt {
  return {
    receiptId: input.receiptId,
    runId: input.runId,
    specHash: input.specHash,
    candidateHash: input.candidateHash,
    toolchainIdentity: input.result.toolchain,
    policy: input.result.policy,
    outcome: input.result.outcome,
    checkResults: input.result.checkResults,
    command: input.result.command,
    exitStatus: input.result.exitStatus,
    executedAt: input.result.executedAt,
    executedBy: input.result.executedBy,
    sealed: true,
  };
}
