// lib/research/lifecycle.ts
// Research Plane — R0 lifecycle. Pure state machine over ResearchRun.
// No I/O, no Supabase, no network.

import {
  ResearchPlaneError,
  type CandidateArtifact,
  type FrozenSpecInput,
  type ResearchRun,
  type TenantScope,
  isValidTransition,
  requireTenantAccess,
  sha256Json,
} from './contracts';

export interface FreezeSpecResult {
  run: ResearchRun;
  specHash: string;
}

export interface ProposeCandidateResult {
  run: ResearchRun;
  artifact: CandidateArtifact & { sealed: boolean; artifactId: string };
}

export interface SubmitVerificationResult {
  run: ResearchRun;
  receipt: {
    receiptId: string;
    runId: string;
    specHash: string;
    candidateHash: string;
    toolchainIdentity: { name: string; version: string; type: string };
    policy: unknown;
    outcome: string;
    checkResults: unknown;
    command: string;
    exitStatus: number;
    executedAt: string;
    executedBy: string;
    sealed: boolean;
  };
}

export function createRun(
  tenantScope: TenantScope,
  input: {
    runId: string;
    ownerUserId: string;
    workspaceId: string;
    tenantScope: TenantScope;
    createdAt: string;
  },
): ResearchRun {
  requireTenantAccess(tenantScope, input.tenantScope);
  return {
    runId: input.runId,
    ownerUserId: input.ownerUserId,
    workspaceId: input.workspaceId,
    tenantScope: input.tenantScope,
    status: 'CREATED',
    specVersion: 0,
    specHash: null,
    candidateHash: null,
    verificationReceiptId: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function freezeSpec(
  tenantScope: TenantScope,
  run: ResearchRun,
  input: FrozenSpecInput,
): FreezeSpecResult {
  requireTenantAccess(tenantScope, run.tenantScope);
  if (run.status === 'SPEC_FROZEN' && run.specHash === input.hash && run.specVersion === input.version) {
    return { run, specHash: input.hash };
  }
  if (run.status !== 'CREATED') {
    throw new ResearchPlaneError(
      `freezeSpec requires CREATED status, got ${run.status}`,
      'INVALID_TRANSITION',
    );
  }
  const actualHash = sha256Json(input.spec);
  if (input.hash !== actualHash) {
    throw new ResearchPlaneError(
      'Caller hash does not match recomputed spec digest',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
  return {
    run: {
      ...run,
      status: 'SPEC_FROZEN',
      specVersion: run.specVersion + 1,
      specHash: input.hash,
      updatedAt: input.frozenAt,
    },
    specHash: input.hash,
  };
}

export function proposeCandidate(
  tenantScope: TenantScope,
  run: ResearchRun,
  input: {
    artifact: { type: string; contentHash: string; contentSize: number; references: string[]; dependencyHashes: Record<string, string> };
    artifactId: string;
    createdAt: string;
    createdBy: string;
  },
): ProposeCandidateResult {
  requireTenantAccess(tenantScope, run.tenantScope);
  if (run.status !== 'RESEARCHING') {
    throw new ResearchPlaneError(
      `proposeCandidate requires RESEARCHING status, got ${run.status}`,
      'INVALID_TRANSITION',
    );
  }
  const artifact: CandidateArtifact & { sealed: boolean; artifactId: string } = {
    runId: run.runId,
    type: input.artifact.type as 'proof',
    contentHash: input.artifact.contentHash,
    contentSize: input.artifact.contentSize,
    references: input.artifact.references,
    dependencyHashes: input.artifact.dependencyHashes,
    sealed: true,
    artifactId: input.artifactId,
  };
  return {
    run: {
      ...run,
      status: 'CANDIDATE_READY',
      candidateHash: input.artifact.contentHash,
      updatedAt: input.createdAt,
    },
    artifact,
  };
}

export function submitVerification(
  tenantScope: TenantScope,
  run: ResearchRun,
  input: {
    receipt: {
      outcome: string;
      checkResults: unknown;
      command: string;
      exitStatus: number;
      specHash: string;
      candidateHash: string;
      toolchainIdentity: { name: string; version: string; type: string };
      policy: unknown;
    };
    receiptId: string;
    executedAt: string;
    executedBy: string;
    producerRole: string;
    verifierProvider: { identity: { name: string; version: string; type: string } };
  },
): SubmitVerificationResult {
  requireTenantAccess(tenantScope, run.tenantScope);
  if (run.status !== 'VERIFICATION_PENDING') {
    throw new ResearchPlaneError(
      `submitVerification requires VERIFICATION_PENDING status, got ${run.status}`,
      'INVALID_TRANSITION',
    );
  }
  const { receipt } = input;

  // Reject forged VERIFIED with failing checks
  if (receipt.outcome === 'VERIFIED') {
    const checks = receipt.checkResults as Record<string, { passed?: boolean }> | undefined;
    const checkKeys = checks ? Object.keys(checks) : [];
    const allPassed = checkKeys.length > 0 && checkKeys.every((k) => checks![k].passed === true);
    if (!allPassed) {
      throw new ResearchPlaneError(
        'VERIFIED outcome with failing or missing check results',
        'VERIFICATION_BIND_MISMATCH',
      );
    }
    if (receipt.exitStatus !== 0) {
      throw new ResearchPlaneError(
        'VERIFIED outcome with non-zero exit status',
        'VERIFICATION_BIND_MISMATCH',
      );
    }
  }

  // Reject agent-as-verifier
  const verifierName = input.verifierProvider.identity.name;
  if (verifierName === 'agent' || verifierName === input.producerRole) {
    throw new ResearchPlaneError(
      'Agent cannot act as verifier',
      'VERIFIER_NOT_INDEPENDENT',
    );
  }

  // Reject specHash mismatch
  if (run.specHash !== null && receipt.specHash !== run.specHash) {
    throw new ResearchPlaneError(
      'Receipt specHash does not match run specHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  // Reject candidateHash mismatch
  if (run.candidateHash !== null && receipt.candidateHash !== run.candidateHash) {
    throw new ResearchPlaneError(
      'Receipt candidateHash does not match run candidateHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  return {
    run: {
      ...run,
      status: 'VERIFIED',
      verificationReceiptId: input.receiptId,
      updatedAt: input.executedAt,
    },
    receipt: {
      receiptId: input.receiptId,
      runId: run.runId,
      specHash: receipt.specHash,
      candidateHash: receipt.candidateHash,
      toolchainIdentity: receipt.toolchainIdentity,
      policy: receipt.policy,
      outcome: receipt.outcome,
      checkResults: receipt.checkResults,
      command: receipt.command,
      exitStatus: receipt.exitStatus,
      executedAt: input.executedAt,
      executedBy: input.executedBy,
      sealed: true,
    },
  };
}

export function transitionToStatus(
  tenantScope: TenantScope,
  run: ResearchRun,
  input: { status: ResearchRun['status']; at: string },
): ResearchRun {
  requireTenantAccess(tenantScope, run.tenantScope);
  if (run.status === input.status) {
    return run;
  }
  // VERIFICATION_PENDING terminal transitions must go through submitVerification
  if (
    run.status === 'VERIFICATION_PENDING' &&
    ['VERIFIED', 'FAILED', 'INCONCLUSIVE', 'REJECTED'].includes(input.status)
  ) {
    throw new ResearchPlaneError(
      `VERIFICATION_PENDING to ${input.status} requires submitVerification`,
      'INVALID_TRANSITION',
    );
  }
  if (!isValidTransition(run.status, input.status)) {
    throw new ResearchPlaneError(
      `Invalid transition from ${run.status} to ${input.status}`,
      'INVALID_TRANSITION',
    );
  }
  return {
    ...run,
    status: input.status,
    updatedAt: input.at,
  };
}

export function validateReceiptBinding(
  run: ResearchRun,
  receipt: {
    receiptId: string;
    runId: string;
    specHash: string;
    candidateHash: string;
    toolchainIdentity: { name: string; version: string; type: string };
    policy: unknown;
    outcome: string;
    checkResults: unknown;
    command: string;
    exitStatus: number;
    executedAt: string;
    executedBy: string;
    sealed: boolean;
  },
): void {
  if (run.specHash !== null && receipt.specHash !== run.specHash) {
    throw new ResearchPlaneError(
      'Receipt specHash does not match run specHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
  if (run.candidateHash !== null && receipt.candidateHash !== run.candidateHash) {
    throw new ResearchPlaneError(
      'Receipt candidateHash does not match run candidateHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
}
