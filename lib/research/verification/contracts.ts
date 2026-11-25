// lib/research/verification/contracts.ts
// Research Plane — R0 verification contracts. Pure, no I/O.

import type { VerificationReceipt, VerifierIdentity, VerificationPolicy } from '../contracts';
import { ResearchPlaneError } from '../contracts';

export interface VerificationResult {
  outcome: 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE';
  checkResults: Record<string, { passed: boolean; reason?: string }>;
  command: string;
  exitStatus: number;
  executedAt: string;
  executedBy: string;
  toolchain: VerifierIdentity;
  policy: VerificationPolicy;
}

export interface VerifierProvider {
  identity: { name: string; version: string; type: string };
  policy: unknown;
  verify: unknown;
}

export const DEFAULT_VERIFICATION_POLICY = {
  policyId: 'lean-verification-policy-v1',
  requiredChecks: [
    'compilation',
    'kernel_acceptance',
    'axiom_inspection',
    'proof_completeness',
    'mathematical_relatedness',
  ],
  allowedAxioms: [],
  disallowedAxioms: [],
};

export function buildReceipt(input: {
  receiptId: string;
  runId: string;
  specHash: string;
  candidateHash: string;
  result: VerificationResult;
}): Omit<VerificationReceipt, never> & VerificationReceipt {
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

export function assertVerifierIndependence(
  producerRole: string,
  provider: VerifierProvider,
): void {
  const verifierName = provider.identity.name;
  // Agent roles and the generic 'agent' identity cannot verify
  const agentRoles = ['explorer', 'formalizer', 'critic', 'coordinator', 'agent'];
  if (agentRoles.includes(verifierName)) {
    throw new ResearchPlaneError('Agent cannot act as verifier', 'VERIFIER_NOT_INDEPENDENT');
  }
  if (verifierName === producerRole) {
    throw new ResearchPlaneError('Producer cannot verify own work', 'VERIFIER_NOT_INDEPENDENT');
  }
}
