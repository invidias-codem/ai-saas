/**
 * CE0 offline review contract. Reviewers assign verdicts from actual output
 * and evidence. This code checks completeness and enforces hard gates;
 * it does not infer factual accuracy or score prose automatically.
 */
import type { IntellectualDepth } from './expansion';

export const REVIEW_CRITERIA = [
  'factual_integrity', 'evidence_integrity', 'independent_judgment',
  'historical_context', 'uncertainty_calibration', 'user_progress',
  'proportionality', 'authority_integrity',
] as const;
export type ReviewCriterion = typeof REVIEW_CRITERIA[number];
export type ReviewVerdict = 'pass' | 'fail' | 'not_applicable' | 'inconclusive';
export interface CriterionReview {
  criterion: ReviewCriterion;
  verdict: ReviewVerdict;
  rationale: string;
}
export interface ExpansionCase {
  id: string;
  depth: IntellectualDepth;
  prompt: string;
  context: string;
  expected: string[];
  disallowed: string[];
  requiredCriteria: ReviewCriterion[];
}
export interface ReviewOutcome {
  status: 'pass' | 'fail' | 'inconclusive';
  reasons: string[];
}

const mandatory: readonly ReviewCriterion[] = [
  'factual_integrity', 'evidence_integrity', 'independent_judgment',
  'uncertainty_calibration', 'user_progress', 'proportionality',
  'authority_integrity',
];
const verdicts: readonly ReviewVerdict[] = ['pass', 'fail', 'not_applicable', 'inconclusive'];

export function evaluateExpansionReview(
  testCase: ExpansionCase,
  reviews: readonly CriterionReview[],
): ReviewOutcome {
  const required = new Set([...mandatory, ...testCase.requiredCriteria]);
  const seen = new Map<ReviewCriterion, ReviewVerdict>();
  const reasons: string[] = [];
  const failures: string[] = [];
  for (const row of reviews) {
    if (!row || !REVIEW_CRITERIA.includes(row.criterion) ||
        !verdicts.includes(row.verdict) ||
        typeof row.rationale !== 'string' || !row.rationale.trim()) {
      reasons.push('invalid_review');
      continue;
    }
    if (seen.has(row.criterion)) {
      reasons.push('duplicate:' + row.criterion);
      if (row.verdict === 'fail') failures.push(row.criterion);
      continue;
    }
    seen.set(row.criterion, row.verdict);
    if (row.verdict === 'fail') failures.push(row.criterion);
  }
  if (failures.length) return { status: 'fail', reasons: [...new Set(failures)] };
  for (const criterion of REVIEW_CRITERIA) {
    const verdict = seen.get(criterion);
    if (!verdict || verdict === 'inconclusive' ||
        (verdict === 'not_applicable' && required.has(criterion))) {
      reasons.push('unresolved:' + criterion);
    }
  }
  return reasons.length
    ? { status: 'inconclusive', reasons }
    : { status: 'pass', reasons: [] };
}
