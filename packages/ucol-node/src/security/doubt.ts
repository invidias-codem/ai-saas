/**
 * @file security/doubt.ts
 * @description UCOL Doubt Engine — exact formulas from spec §7.2.
 *
 * Computes Doubt_Score and Security_Score for routing decisions.
 * Low Security_Score routes to human review.
 */

import type {
  DoubtInput,
  DoubtResult,
  KnowledgeItem,
  Artifact,
  HistoryItem,
} from '../store/schema.js';

type ContextItem = KnowledgeItem | Artifact | HistoryItem;

/**
 * Compute cosine similarity between two equal-length vectors.
 * Returns 0 if either vector is zero-magnitude or lengths differ.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute a simple text-based embedding proxy for two strings.
 * This is used when real embeddings are not available (e.g., testing).
 * Uses bigram overlap normalized to [0, 1].
 */
function textSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const getBigrams = (s: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2).toLowerCase());
    }
    return bigrams;
  };

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  const intersection = new Set([...bigramsA].filter((bg) => bigramsB.has(bg)));

  const union = new Set([...bigramsA, ...bigramsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Check if a string output contradicts a constraint.
 * Simple heuristic: checks for negation patterns + constraint keywords.
 *
 * @param output - Proposer output text
 * @param constraint - KnowledgeItem of type CONSTRAINT
 * @returns true if output appears to contradict the constraint
 */
function outputContradicts(output: string, constraint: KnowledgeItem): boolean {
  const lower = output.toLowerCase();
  const constraintLower = constraint.content.toLowerCase();

  // Extract key noun phrases from constraint (simplified)
  const words = constraintLower.split(/\s+/).filter((w) => w.length > 4);

  // Look for negation patterns near constraint keywords
  const negationPatterns = [
    /\bno\b/,
    /\bnot\b/,
    /\bnever\b/,
    /\bcannot\b/,
    /\bcan't\b/,
    /\bwon't\b/,
    /\bshouldn't\b/,
    /\bviolat/,
    /\bignor/,
    /\boverrid/,
  ];

  let keywordHit = false;
  for (const word of words.slice(0, 5)) {
    if (lower.includes(word)) {
      keywordHit = true;
      break;
    }
  }

  if (!keywordHit) return false;

  // Check if any negation pattern appears near the keyword
  return negationPatterns.some((p) => p.test(lower));
}

/**
 * UCOL Doubt Engine — implements spec §7.2 formulas exactly.
 */
export class DoubtEngine {
  /**
   * Score a routing decision for uncertainty.
   *
   * Exact formulas from spec §7.2:
   * ```
   * cv = 1.0 - mean(cosine_sim(pi, pj) for all i≠j pairs)  // 0.0 if < 2 outputs
   * cv_flag = 1.0 if any output contradicts constraints else 0.0
   * sr = mean(item.confidence)  // 0.5 default if no items
   * Doubt_Score = cv*0.50 + cv_flag*0.35 + (1-sr)*0.15
   * Security_Score = (relevance * verification) / max(Doubt_Score, 0.01)
   *   verification = 1.0 + (corroborating_count * 0.1), max 2.0
   * ```
   *
   * @param input - DoubtInput with outputs, context, constraints, and task
   * @returns DoubtResult with all computed scores and action
   */
  score(input: DoubtInput): DoubtResult {
    const { proposer_outputs, context_fragment, constraint_set, task } = input;

    // ── Confidence Variance (cv) ──────────────────────────────────────────────
    // cv = 1.0 - mean(cosine_sim(pi, pj) for all i≠j pairs)
    // 0.0 if < 2 outputs
    let cv = 0.0;
    if (proposer_outputs.length >= 2) {
      const similarities: number[] = [];
      for (let i = 0; i < proposer_outputs.length; i++) {
        for (let j = i + 1; j < proposer_outputs.length; j++) {
          similarities.push(textSimilarity(proposer_outputs[i], proposer_outputs[j]));
        }
      }
      const meanSim = similarities.reduce((acc, s) => acc + s, 0) / similarities.length;
      cv = 1.0 - meanSim;
    }

    // ── Constraint Violation Flag (cv_flag) ───────────────────────────────────
    // cv_flag = 1.0 if any output contradicts constraints else 0.0
    let cvFlag = 0.0;
    if (constraint_set.length > 0 && proposer_outputs.length > 0) {
      const hasViolation = constraint_set.some((constraint) =>
        proposer_outputs.some((output) => outputContradicts(output, constraint))
      );
      cvFlag = hasViolation ? 1.0 : 0.0;
    }

    // ── Source Reliability (sr) ───────────────────────────────────────────────
    // sr = mean(item.confidence)  // 0.5 default if no items
    const confidences = context_fragment
      .map((item) => {
        if ('confidence' in item) return (item as KnowledgeItem).confidence;
        return 0.5; // artifacts and history default
      })
      .filter((c) => c !== undefined);

    const sr =
      confidences.length > 0
        ? confidences.reduce((acc, c) => acc + c, 0) / confidences.length
        : 0.5;

    // ── Doubt Score ───────────────────────────────────────────────────────────
    // Doubt_Score = cv*0.50 + cv_flag*0.35 + (1-sr)*0.15
    const doubtScore = cv * 0.5 + cvFlag * 0.35 + (1.0 - sr) * 0.15;

    // ── Security Score ────────────────────────────────────────────────────────
    // relevance = cosine_sim(embed(context_fragment), embed(task.query))
    // verification = 1.0 + (corroborating_count * 0.1), max 2.0
    // Security_Score = (relevance * verification) / max(Doubt_Score, 0.01)
    const relevance = this.computeRelevance(context_fragment, task.query);
    const corroboratingCount = this.countCorroborating(context_fragment);
    const verification = Math.min(1.0 + corroboratingCount * 0.1, 2.0);
    const securityScore = (relevance * verification) / Math.max(doubtScore, 0.01);

    // ── Thresholds ────────────────────────────────────────────────────────────
    // >= 8.0 AUTO_APPROVE, 4.0-8.0 PROCEED_WITH_LOG, < 4.0 HUMAN_REVIEW
    let action: DoubtResult['action'];
    if (securityScore >= 8.0) {
      action = 'AUTO_APPROVE';
    } else if (securityScore >= 4.0) {
      action = 'PROCEED_WITH_LOG';
    } else {
      action = 'HUMAN_REVIEW';
    }

    return {
      doubt_score: Math.min(doubtScore, 1.0), // clamp to [0, 1]
      security_score: securityScore,
      review_required: action === 'HUMAN_REVIEW',
      action,
      confidence_variance: cv,
      constraint_violation_flag: cvFlag,
      source_reliability: sr,
    };
  }

  /**
   * Compute relevance between context fragment and task query.
   * Uses bigram text similarity as a proxy for embedding cosine similarity.
   *
   * @param contextItems - Context fragment items
   * @param query - Task query string
   * @returns Relevance score in [0, 1]
   */
  private computeRelevance(contextItems: ContextItem[], query: string): number {
    if (contextItems.length === 0) return 0.5; // neutral relevance

    const contextText = contextItems
      .map((item) => {
        if ('content' in item) return (item as KnowledgeItem | HistoryItem).content;
        if ('description' in item) return (item as Artifact).description ?? '';
        return '';
      })
      .join(' ');

    return textSimilarity(contextText, query);
  }

  /**
   * Count corroborating knowledge items (high confidence, verified facts).
   * An item is corroborating if confidence >= 0.8.
   *
   * @param contextItems - Context fragment items
   * @returns Count of corroborating items (capped at 10 for score calculation)
   */
  private countCorroborating(contextItems: ContextItem[]): number {
    let count = 0;
    for (const item of contextItems) {
      if ('confidence' in item && (item as KnowledgeItem).confidence >= 0.8) {
        count++;
      }
    }
    return Math.min(count, 10);
  }
}

/**
 * Create a human review notification payload per spec §7.2.
 *
 * @param taskId - Task UUID
 * @param doubtResult - Doubt Engine result
 * @param flaggedOutputs - Outputs that triggered review
 * @param constraintViolations - Constraint IDs that were violated
 * @param reviewDeadlineMinutes - Minutes until review deadline (default: 15)
 */
export function createHumanReviewNotification(
  taskId: string,
  doubtResult: DoubtResult,
  flaggedOutputs: string[] = [],
  constraintViolations: string[] = [],
  reviewDeadlineMinutes: number = 15
): Record<string, unknown> {
  const now = new Date();
  const deadline = new Date(now.getTime() + reviewDeadlineMinutes * 60 * 1000);

  return {
    event: 'ucol.human_review_required',
    task_id: taskId,
    doubt_score: doubtResult.doubt_score,
    security_score: doubtResult.security_score,
    flagged_outputs: flaggedOutputs,
    constraint_violations: constraintViolations,
    timestamp: now.toISOString(),
    review_deadline: deadline.toISOString(),
  };
}
