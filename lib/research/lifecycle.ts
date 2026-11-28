// Research Plane — R0.1: Research run lifecycle (security-hardened).
//
// Fail-closed state machine:
//   CREATED -> SPEC_FROZEN -> RESEARCHING -> CANDIDATE_READY -> VERIFICATION_PENDING
//   Terminal: VERIFIED, FAILED, INCONCLUSIVE, REJECTED
//
// Invariants:
//   * No direct agent promotion to VERIFIED (only a verifier can set it).
//   * All transitions are idempotent (replaying the same transition is a no-op).
//   * Tenant access checked on every mutating operation.
//   * Spec hash independently recomputed at freeze (no trusted caller hash).
//   * Receipt outcome validated against checker results before acceptance.
//   * Immutable sealed artifacts: once sealed, content cannot change.
//
// Pure: no I/O, no wall-clock, no DB. Callers persist.

import type {
  CandidateArtifact,
  ResearchRun,
  ResearchRunStatus,
  VerificationOutcome,
  VerificationReceipt,
} from '@/lib/research/contracts';
import {
  ResearchPlaneError,
  requireValidTransition,
  requireTenantAccess,
  sha256Json,
  type ResearchSpecification,
} from '@/lib/research/contracts';
import {
  determineOutcome,
  validateReceiptConsistency,
} from '@/lib/research/verification/policy';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { VerifierProvider } from '@/lib/research/verification/contracts';
import { assertVerifierIndependence } from '@/lib/research/verification/contracts';

export interface FrozenSpecInput {
  version: number;
  hash: string;
  spec: ResearchSpecification;
  frozenAt: string;
  frozenBy: string;
}

export interface FreezeSpecResult {
  readonly run: ResearchRun;
  readonly specVersion: number;
  readonly specHash: string;
}

/**
 * Freeze a research specification. Independently recomputes the spec digest
 * from the supplied bytes rather than trusting a caller-supplied hash.
 *
 * Fail-closed: only CREATED -> SPEC_FROZEN is allowed. Requires tenant write
 * access. Idempotent: re-freezing with the same version+digest on an
 * already-frozen run returns the current state unchanged.
 */
export function freezeSpec(
  callerScope: TenantScope | null,
  run: ResearchRun,
  input: FrozenSpecInput,
): FreezeSpecResult {
  requireTenantAccess(callerScope, run.tenantScope);

  // Independently recompute the spec digest from the actual bytes.
  const actualHash = sha256Json(input.spec);
  if (actualHash !== input.hash) {
    throw new ResearchPlaneError(
      `Supplied spec hash does not match recomputed digest of specification bytes`,
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  // Idempotent: re-freezing with the same version+hash is a no-op.
  if (
    run.status === 'SPEC_FROZEN' &&
    run.specVersion === input.version &&
    run.specHash === input.hash
  ) {
    return { run, specVersion: input.version, specHash: input.hash };
  }

  requireValidTransition(run.status, 'SPEC_FROZEN');

  const next: ResearchRun = {
    ...run,
    status: 'SPEC_FROZEN',
    specVersion: input.version,
    specHash: input.hash,
    updatedAt: input.frozenAt,
  };

  return { run: next, specVersion: input.version, specHash: input.hash };
}

export interface ProposeCandidateInput {
  artifact: Omit<CandidateArtifact, 'artifactId' | 'createdAt' | 'createdBy' | 'sealed'>;
  artifactId: string;
  createdAt: string;
  createdBy: string;
}

export interface ProposeCandidateResult {
  readonly run: ResearchRun;
  readonly artifact: CandidateArtifact;
}

/**
 * Propose a candidate artifact. Only allowed from RESEARCHING -> CANDIDATE_READY.
 * Requires tenant write access. The artifact is sealed (immutable) upon proposal.
 */
export function proposeCandidate(
  callerScope: TenantScope | null,
  run: ResearchRun,
  input: ProposeCandidateInput,
): ProposeCandidateResult {
  requireTenantAccess(callerScope, run.tenantScope);
  requireValidTransition(run.status, 'CANDIDATE_READY');

  const artifact: CandidateArtifact = {
    ...input.artifact,
    artifactId: input.artifactId,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    sealed: true,
  };

  const next: ResearchRun = {
    ...run,
    status: 'CANDIDATE_READY',
    candidateHash: artifact.contentHash,
    updatedAt: input.createdAt,
  };

  return { run: next, artifact };
}

export interface SubmitVerificationInput {
  receipt: Omit<VerificationReceipt, 'receiptId' | 'executedAt' | 'executedBy' | 'sealed'>;
  receiptId: string;
  executedAt: string;
  executedBy: string;
  producerRole: string;
  verifierProvider: VerifierProvider;
}

export interface SubmitVerificationResult {
  readonly run: ResearchRun;
  readonly receipt: VerificationReceipt;
}

/**
 * Submit a verification receipt. Only allowed from VERIFICATION_PENDING.
 *
 * Fail-closed admission:
 *   1. Requires tenant write access.
 *   2. Requires an independent verifier provider (not the candidate producer).
 *   3. Receipt specHash and candidateHash must match the run's hashes.
 *   4. Receipt outcome must be consistent with its check results and policy
 *      (a VERIFIED receipt with failing checks is rejected).
 *
 * Only a verifier (not the agent that produced the candidate) may submit.
 */
export function submitVerification(
  callerScope: TenantScope | null,
  run: ResearchRun,
  input: SubmitVerificationInput,
): SubmitVerificationResult {
  requireTenantAccess(callerScope, run.tenantScope);

  if (run.status !== 'VERIFICATION_PENDING') {
    throw new ResearchPlaneError(
      `Verification submission requires VERIFICATION_PENDING run, got ${run.status}`,
      'INVALID_TRANSITION',
    );
  }

  // Verifier independence: the candidate-producing agent cannot act as its
  // own verifier. The producer role and verifier provider must be independent.
  assertVerifierIndependence(input.producerRole, input.verifierProvider);

  // Receipt hashes must bind to the run's frozen spec and sealed candidate.
  if (run.specHash === null || input.receipt.specHash !== run.specHash) {
    throw new ResearchPlaneError(
      'Verification receipt specHash does not match run specHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
  if (run.candidateHash === null || input.receipt.candidateHash !== run.candidateHash) {
    throw new ResearchPlaneError(
      'Verification receipt candidateHash does not match run candidateHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  // Outcome must be consistent with checker results and policy. A VERIFIED
  // receipt whose required checks failed is rejected outright.
  const consistency = validateReceiptConsistency(
    input.verifierProvider.policy,
    input.receipt.outcome,
    input.receipt.checkResults,
  );
  if (!consistency.consistent) {
    throw new ResearchPlaneError(
      `Receipt outcome inconsistent with check results: ${consistency.reason}`,
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  // The claimed outcome must match the outcome computed from the receipt's
  // own evidence. A forged receipt claiming VERIFIED with a nonzero exit
  // status or insufficient checks is rejected.
  const computedOutcome = determineOutcome({
    policy: input.verifierProvider.policy,
    checkResults: input.receipt.checkResults,
    exitStatus: input.receipt.exitStatus,
    disallowedAxiomsUsed: [],
    placeholdersPresent: false,
    timeoutExceeded: input.receipt.exitStatus !== 0,
  });
  if (computedOutcome !== input.receipt.outcome) {
    throw new ResearchPlaneError(
      `Receipt claims ${input.receipt.outcome} but evidence computes ${computedOutcome}`,
      'VERIFICATION_BIND_MISMATCH',
    );
  }

  const receipt: VerificationReceipt = {
    ...input.receipt,
    receiptId: input.receiptId,
    executedAt: input.executedAt,
    executedBy: input.executedBy,
    sealed: true,
  };

  let nextStatus: ResearchRunStatus;
  switch (receipt.outcome) {
    case 'VERIFIED':
      nextStatus = 'VERIFIED';
      break;
    case 'FAILED':
      nextStatus = 'FAILED';
      break;
    case 'INCONCLUSIVE':
      nextStatus = 'INCONCLUSIVE';
      break;
    case 'REJECTED':
      nextStatus = 'REJECTED';
      break;
    default:
      nextStatus = 'REJECTED';
  }

  const next: ResearchRun = {
    ...run,
    status: nextStatus,
    verificationReceiptId: receipt.receiptId,
    updatedAt: input.executedAt,
  };

  return { run: next, receipt };
}

export interface TransitionToStatusInput {
  status: ResearchRunStatus;
  at: string;
}

/**
 * Transition a run to a terminal or intermediate status. Used for
 * RESEARCHING -> FAILED/REJECTED and other non-verification transitions.
 * Requires tenant write access.
 *
 * Fail-closed: only transitions allowed by isValidTransition. Idempotent:
 * if the run is already at the target status, returns unchanged.
 */
export function transitionToStatus(
  callerScope: TenantScope | null,
  run: ResearchRun,
  input: TransitionToStatusInput,
): ResearchRun {
  requireTenantAccess(callerScope, run.tenantScope);

  if (run.status === input.status) return run;

  // Reserve all verification-terminal transitions for submitVerification().
  // A caller with matching tenant scope must not reach VERIFIED (or any
  // verification outcome) without a submitted receipt.
  if (run.status === 'VERIFICATION_PENDING' && isTerminalStatus(input.status)) {
    throw new ResearchPlaneError(
      `Direct promotion from VERIFICATION_PENDING to ${input.status} is reserved for submitVerification()`,
      'INVALID_TRANSITION',
    );
  }

  requireValidTransition(run.status, input.status);

  return {
    ...run,
    status: input.status,
    updatedAt: input.at,
  };
}

function isTerminalStatus(status: ResearchRunStatus): boolean {
  return ['VERIFIED', 'FAILED', 'INCONCLUSIVE', 'REJECTED'].includes(status);
}

/**
 * Validate that a verification receipt binds to the exact run state.
 * Throws VERIFICATION_BIND_MISMATCH on any mismatch.
 */
export function validateReceiptBinding(
  run: ResearchRun,
  receipt: VerificationReceipt,
): void {
  if (receipt.specHash !== run.specHash) {
    throw new ResearchPlaneError(
      'Receipt specHash does not match run specHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
  if (receipt.candidateHash !== run.candidateHash) {
    throw new ResearchPlaneError(
      'Receipt candidateHash does not match run candidateHash',
      'VERIFICATION_BIND_MISMATCH',
    );
  }
}

/**
 * Create a new research run in CREATED status.
 * Requires tenant write access.
 */
export function createRun(
  callerScope: TenantScope | null,
  input: {
    runId: string;
    ownerUserId: string;
    workspaceId: string | null;
    tenantScope: TenantScope | null;
    createdAt: string;
  },
): ResearchRun {
  requireTenantAccess(callerScope, input.tenantScope);
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
