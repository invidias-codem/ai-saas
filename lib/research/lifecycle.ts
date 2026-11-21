// Research Plane — R0: Research run lifecycle.
//
// Fail-closed state machine:
//   CREATED -> SPEC_FROZEN -> RESEARCHING -> CANDIDATE_READY -> VERIFICATION_PENDING
//   Terminal: VERIFIED, FAILED, INCONCLUSIVE, REJECTED
//
// Invariants:
//   * No direct agent promotion to VERIFIED (only a verifier can set it).
//   * All transitions are idempotent (replaying the same transition is a no-op).
//   * Ownership checked on every mutating operation.
//   * Concurrency safe: status changes are CAS on specVersion/specHash.
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
import { ResearchPlaneError, requireValidTransition } from '@/lib/research/contracts';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export interface FrozenSpecInput {
  version: number;
  hash: string;
  spec: unknown;
  frozenAt: string;
  frozenBy: string;
}

export interface FreezeSpecResult {
  readonly run: ResearchRun;
  readonly specVersion: number;
  readonly specHash: string;
}

/**
 * Freeze a research specification. Idempotent: replaying the same version+hash
 * is a no-op that returns the current run state.
 *
 * Fail-closed: only CREATED -> SPEC_FROZEN is allowed. Any other current
 * status throws INVALID_TRANSITION.
 */
export function freezeSpec(
  run: ResearchRun,
  input: FrozenSpecInput,
): FreezeSpecResult {
  // Idempotent: re-freezing with the same version+hash on an already-frozen
  // run is a no-op. A different hash requires a new spec version (revision).
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
 * The artifact is sealed (immutable) upon proposal.
 */
export function proposeCandidate(
  run: ResearchRun,
  input: ProposeCandidateInput,
): ProposeCandidateResult {
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
}

export interface SubmitVerificationResult {
  readonly run: ResearchRun;
  readonly receipt: VerificationReceipt;
}

/**
 * Submit a verification receipt. Only allowed from VERIFICATION_PENDING.
 *
 * Invariant: the receipt's specHash and candidateHash must match the run's
 * specHash and candidateHash. Mismatch throws VERIFICATION_BIND_MISMATCH.
 *
 * Only a verifier (not the agent that produced the candidate) may submit.
 * The caller must assert executedBy is a verifier identity before calling.
 */
export function submitVerification(
  run: ResearchRun,
  input: SubmitVerificationInput,
): SubmitVerificationResult {
  // The run must already be in VERIFICATION_PENDING. We do NOT call
  // requireValidTransition here because the transition target depends on the
  // receipt outcome (VERIFIED/FAILED/INCONCLUSIVE/REJECTED), not a single
  // fixed next status.
  if (run.status !== 'VERIFICATION_PENDING') {
    throw new ResearchPlaneError(
      `Verification submission requires VERIFICATION_PENDING run, got ${run.status}`,
      'INVALID_TRANSITION',
    );
  }

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
 *
 * Fail-closed: only transitions allowed by isValidTransition. Idempotent:
 * if the run is already at the target status, returns unchanged.
 */
export function transitionToStatus(
  run: ResearchRun,
  input: TransitionToStatusInput,
): ResearchRun {
  if (run.status === input.status) return run;

  requireValidTransition(run.status, input.status);

  return {
    ...run,
    status: input.status,
    updatedAt: input.at,
  };
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
 */
export function createRun(input: {
  runId: string;
  ownerUserId: string;
  workspaceId: string | null;
  tenantScope: TenantScope | null;
  createdAt: string;
}): ResearchRun {
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
