import {
  assessCorrectionRule,
  normalizeCorrectionPath,
  recordCorrection,
  reviewCorrectionRule,
  type CorrectionEvidence,
  type CorrectionRuleCandidate,
} from '@/lib/ucol/correctionPatterns';

const BASE: CorrectionEvidence = {
  id: 'fix-1',
  scopeId: 'tenant-1/workspace-1',
  canonicalPatternId: 'regex/unsafe-anchoring',
  filePath: 'src/auth.ts',
  changeId: 'patch-1',
  validationId: 'ci-1',
  observedAt: '2026-11-05T10:00:00Z',
  verified: true,
};

const RULE = 'Anchor authentication regexes to the complete expected value';

function first(): CorrectionRuleCandidate {
  return recordCorrection(null, BASE, RULE).candidate;
}

describe('correction pattern evidence and proposal gate', () => {
  it('keeps one successful file correction local (observing only)', () => {
    const assessment = recordCorrection(null, BASE, RULE);
    expect(assessment.recorded).toBe(true);
    expect(assessment.confirmations).toBe(1);
    expect(assessment.candidate.status).toBe('observing');
    expect(assessment.candidate.review).toBeUndefined();
  });

  it('counts two files on the same day as two confirmations', () => {
    const assessment = recordCorrection(first(), {
      ...BASE,
      id: 'fix-2',
      filePath: 'src/webhook.ts',
      // Same patch and same CI run still count as two occurrences.
    }, RULE);
    expect(assessment.confirmations).toBe(2);
    expect(assessment.independentValidations).toBe(1);
    expect(assessment.candidate.status).toBe('proposed');
    expect(assessment.candidate.review).toBeUndefined();
  });

  it('treats separate verified changes in the same file as distinct confirmations', () => {
    const assessment = recordCorrection(first(), {
      ...BASE,
      id: 'fix-2',
      changeId: 'patch-2',
      validationId: 'ci-2',
    }, RULE);
    expect(assessment.confirmations).toBe(2);
    expect(assessment.independentValidations).toBe(2);
    expect(assessment.candidate.status).toBe('proposed');
  });

  it('does not double-count replayed events or the same file within one change', () => {
    const withSameId = recordCorrection(first(), BASE, RULE);
    expect(withSameId.reason).toBe('duplicate');
    const withDifferentId = recordCorrection(first(), {
      ...BASE, id: 'fix-again', filePath: './src//auth.ts',
    }, RULE);
    expect(withDifferentId.reason).toBe('duplicate');
    expect(withDifferentId.confirmations).toBe(1);
  });

  it('does not count unverified or failing changes', () => {
    const assessment = recordCorrection(first(), {
      ...BASE, id: 'fix-2', filePath: 'src/webhook.ts', verified: false,
    }, RULE);
    expect(assessment.recorded).toBe(false);
    expect(assessment.reason).toBe('unverified');
    expect(assessment.candidate.status).toBe('observing');
  });

  it('keeps scope and pattern identities separate, even for similar wording', () => {
    expect(() => recordCorrection(first(), {
      ...BASE, id: 'fix-2', scopeId: 'tenant-2/workspace-1',
      filePath: 'src/webhook.ts',
    }, RULE)).toThrow('scope or pattern');
    expect(() => recordCorrection(first(), {
      ...BASE, id: 'fix-2', canonicalPatternId: 'regex/other-bug',
      filePath: 'src/webhook.ts',
    }, RULE)).toThrow('scope or pattern');
  });

  it('normalizes repo-relative paths and rejects absolute/traversal paths', () => {
    expect(normalizeCorrectionPath('src\\webhook.ts')).toBe('src/webhook.ts');
    expect(() => normalizeCorrectionPath('../secret')).toThrow();
    expect(() => normalizeCorrectionPath('/etc/passwd')).toThrow();
    expect(() => normalizeCorrectionPath('C:\\Windows\\system.ini')).toThrow();
  });

  it('rejects review at one occurrence but allows an explicitly reviewed proposal', () => {
    expect(() => reviewCorrectionRule(first(), 'reviewer', 'approved',
      '2026-11-05T12:00:00Z')).toThrow('Only proposed');
    const ready = recordCorrection(first(), {
      ...BASE, id: 'fix-2', filePath: 'src/webhook.ts',
    }, RULE).candidate;
    const approved = reviewCorrectionRule(ready, 'reviewer', 'approved',
      '2026-11-05T12:00:00Z');
    expect(approved.status).toBe('approved');
    expect(approved.review?.reviewerId).toBe('reviewer');
    expect(assessCorrectionRule(approved).confirmations).toBe(2);
    const closed = recordCorrection(approved, {
      ...BASE, id: 'fix-3', filePath: 'src/other.ts',
    }, RULE);
    expect(closed.reason).toBe('closed');
    expect(closed.confirmations).toBe(2);
  });

  it('supports rejection without accidentally activating the rule', () => {
    const proposed = recordCorrection(first(), {
      ...BASE, id: 'fix-2', filePath: 'src/webhook.ts',
    }, RULE).candidate;
    const rejected = reviewCorrectionRule(proposed, 'reviewer', 'rejected',
      '2026-11-05T12:00:00Z');
    expect(rejected.status).toBe('rejected');
    expect(() => reviewCorrectionRule(rejected, 'reviewer', 'approved',
      '2026-11-05T13:00:00Z')).toThrow('Only proposed');
  });

  it('tracks distinct validation runs separately from file occurrences', () => {
    const firstAssessment = recordCorrection(null, BASE, RULE);
    const secondAssessment = recordCorrection(firstAssessment.candidate, {
      ...BASE, id: 'fix-2', filePath: 'src/webhook.ts',
      changeId: 'patch-2', validationId: 'ci-2',
      observedAt: '2026-11-06T10:00:00Z',
    }, RULE);
    expect(secondAssessment.confirmations).toBe(2);
    expect(secondAssessment.independentValidations).toBe(2);
  });
});
