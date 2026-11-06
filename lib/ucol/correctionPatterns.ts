/**
 * Correction-derived rule proposals for the Lattice OS coding harness.
 *
 * This module is deliberately pure: callers must persist the returned candidate,
 * authenticate evidence and reviewers, and separately publish approved rules.
 * Successful tool sequences in proceduralMemory.ts are not correction evidence.
 */

export type CandidateStatus = 'observing' | 'proposed' | 'approved' | 'rejected';

export interface CorrectionEvidence {
  /** Stable event ID. Replays must retain this ID. */
  id: string;
  /** Tenant/workspace-scoped, trusted by the caller. */
  scopeId: string;
  /** Trusted canonical error+fix pattern, not a raw message or filename. */
  canonicalPatternId: string;
  /** Repo-relative path for the corrected file. */
  filePath: string;
  /** Stable patch/commit/change identifier. */
  changeId: string;
  /** Independent verification run; defaults to changeId if not supplied. */
  validationId?: string;
  /** ISO timestamp, for audit only; days/sessions do not reset counters. */
  observedAt: string;
  /** True only after the specific correction was confirmed successful. */
  verified: boolean;
}

export interface RuleReview {
  reviewerId: string;
  decision: 'approved' | 'rejected';
  reviewedAt: string;
}

export interface CorrectionRuleCandidate {
  scopeId: string;
  canonicalPatternId: string;
  /** Suggested text is untrusted until reviewed. Never inject into live prompts. */
  draftRule: string;
  status: CandidateStatus;
  evidence: CorrectionEvidence[];
  review?: RuleReview;
}

export interface CorrectionAssessment {
  candidate: CorrectionRuleCandidate;
  recorded: boolean;
  reason: 'recorded' | 'duplicate' | 'unverified' | 'closed';
  /** Distinct verified (filePath, changeId) pairs for this pattern and scope. */
  confirmations: number;
  /** Distinct validation runs (not automatically equivalent to confirmations). */
  independentValidations: number;
}

export const RULE_PROPOSAL_CONFIRMATIONS = 2;

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(field + ' must be a non-empty string');
  }
  return value.trim();
}

/** Normalize only repo-relative paths, rejecting traversal and absolute paths. */
export function normalizeCorrectionPath(filePath: string): string {
  const path = requireNonEmpty(filePath, 'filePath').replace(/\\/g, '/');
  const pieces = path.split('/').filter((piece) => piece && piece !== '.');
  if (path.startsWith('/') || /^[a-zA-Z]:\//.test(path) ||
      pieces.length === 0 || pieces.includes('..')) {
    throw new Error('filePath must be repo-relative and must not traverse directories');
  }
  return pieces.join('/');
}

function assertIsoTime(value: string, field: string): void {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error(field + ' must be an ISO timestamp');
  }
}

function verifiedEvidence(candidate: CorrectionRuleCandidate): CorrectionEvidence[] {
  return candidate.evidence.filter((entry) => entry.verified);
}

export function assessCorrectionRule(candidate: CorrectionRuleCandidate): {
  confirmations: number;
  independentValidations: number;
} {
  const confirmed = verifiedEvidence(candidate);
  const occurrences = new Set(confirmed.map((entry) =>
    JSON.stringify([entry.changeId, normalizeCorrectionPath(entry.filePath)])
  ));
  const validations = new Set(confirmed.map((entry) => entry.validationId || entry.changeId));
  return { confirmations: occurrences.size, independentValidations: validations.size };
}

/**
 * Record one confirmed file-level correction.
 *
 * The same fix in auth.ts and webhook.ts on the same day counts twice, including
 * when both files are in one commit. A replay of the same file/change does not.
 * Two confirmations produce a PROPOSAL only, never an active instruction.
 *
 * Near-duplicates are grouped only when a trusted upstream classifier assigned
 * the same canonicalPatternId; fuzzy text matching is not an authorization gate.
 */
export function recordCorrection(
  previous: CorrectionRuleCandidate | null,
  incoming: CorrectionEvidence,
  draftRule: string,
): CorrectionAssessment {
  requireNonEmpty(incoming.id, 'id');
  requireNonEmpty(incoming.scopeId, 'scopeId');
  requireNonEmpty(incoming.canonicalPatternId, 'canonicalPatternId');
  requireNonEmpty(incoming.changeId, 'changeId');
  if (incoming.validationId !== undefined) {
    requireNonEmpty(incoming.validationId, 'validationId');
  }
  assertIsoTime(incoming.observedAt, 'observedAt');
  const filePath = normalizeCorrectionPath(incoming.filePath);
  const entry = { ...incoming, filePath };

  if (previous && (previous.scopeId !== entry.scopeId ||
      previous.canonicalPatternId !== entry.canonicalPatternId)) {
    throw new Error('Correction evidence cannot cross scope or pattern boundaries');
  }

  const candidate: CorrectionRuleCandidate = previous ?? {
    scopeId: entry.scopeId,
    canonicalPatternId: entry.canonicalPatternId,
    draftRule: requireNonEmpty(draftRule, 'draftRule'),
    status: 'observing',
    evidence: [],
  };

  const current = assessCorrectionRule(candidate);
  if (candidate.status === 'approved' || candidate.status === 'rejected') {
    return { candidate, recorded: false, reason: 'closed', ...current };
  }

  const duplicate = candidate.evidence.some((old) =>
    old.id === entry.id ||
    (old.changeId === entry.changeId && normalizeCorrectionPath(old.filePath) === filePath)
  );
  if (duplicate) {
    return { candidate, recorded: false, reason: 'duplicate', ...current };
  }

  // Unverified edits are not confirmations and cannot bootstrap a proposal.
  if (!entry.verified) {
    return { candidate, recorded: false, reason: 'unverified', ...current };
  }

  const evidence = [...candidate.evidence, entry];
  const nextCounts = assessCorrectionRule({ ...candidate, evidence });
  const status: CandidateStatus =
    nextCounts.confirmations >= RULE_PROPOSAL_CONFIRMATIONS ? 'proposed' : 'observing';
  return {
    candidate: { ...candidate, evidence, status },
    recorded: true,
    reason: 'recorded',
    ...nextCounts,
  };
}

/**
 * Human/operator decision. Approval does not itself publish or apply the rule;
 * the instruction store must independently enforce approved status + scope.
 */
export function reviewCorrectionRule(
  candidate: CorrectionRuleCandidate,
  reviewerId: string,
  decision: RuleReview['decision'],
  reviewedAt: string,
): CorrectionRuleCandidate {
  requireNonEmpty(reviewerId, 'reviewerId');
  assertIsoTime(reviewedAt, 'reviewedAt');
  if (candidate.status !== 'proposed') {
    throw new Error('Only proposed rules can be reviewed');
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('Unsupported rule review decision');
  }
  if (assessCorrectionRule(candidate).confirmations < RULE_PROPOSAL_CONFIRMATIONS) {
    throw new Error('Insufficient confirmed corrections');
  }
  return {
    ...candidate,
    status: decision,
    review: { reviewerId: reviewerId.trim(), decision, reviewedAt },
  };
}
