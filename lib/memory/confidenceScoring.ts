/**
 * lib/memory/confidenceScoring.ts
 *
 * Confidence Lifecycle Utility — UCOL Context Routing
 *
 * Implements the decay/boost model from Ruflo's LearningBridge (ADR-049),
 * adapted for Tech Genie's ExtractedFact schema and UCOL routing.
 *
 * Model:
 *   effectiveConfidence = clamp(baseConfidence − (hoursElapsed × DECAY_RATE) + (accessCount × BOOST))
 *
 * Thresholds (tuned for cost/quality tradeoff):
 *   > 0.85  →  Gemini Flash   (well-known pattern, fast + cheap)
 *   0.5–0.85 → DeepSeek R1   (moderate complexity, balanced)
 *   < 0.5   →  Claude Sonnet  (novel / high-stakes, best quality)
 *
 * Aggregation strategies (for multi-chunk retrieval):
 *   'minimum'  — conservative: any uncertain chunk escalates the model tier
 *   'average'  — balanced: overall confidence drives routing
 *   'weighted' — top-3 chunks weighted 70%, rest 30%
 */

import type { ExtractedFact } from '@/lib/intelligentMemory';

// ─── Date Normalization ───────────────────────────────────────────────────────

/**
 * Normalize any timestamp shape to a valid Date.
 *
 * Facts can arrive as:
 *   - real Date objects (ideal)
 *   - ISO strings (after JSON.parse / req.json())
 *   - Unix ms numbers
 *   - Firestore Timestamp objects with a toDate() method
 *   - null / undefined
 *
 * Always returns a valid Date. Falls back to `new Date()` (now) when the
 * input cannot be parsed, so hoursElapsed = 0 and no decay is applied —
 * the conservative safe default.
 */
export function normalizeDate(input: unknown): Date {
  if (input == null) return new Date();

  // Already a Date — validate it
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? new Date() : input;
  }

  // String or number — parse it
  if (typeof input === 'string' || typeof input === 'number') {
    const d = new Date(input as string | number);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  // Firestore Timestamp (has toDate() method)
  if (typeof (input as Record<string, unknown>).toDate === 'function') {
    try {
      const d = (input as { toDate(): Date }).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
    } catch {
      return new Date();
    }
  }

  return new Date(); // Unknown shape — treat as now (no decay)
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Confidence lost per hour without access (0.5%/hr → fully decayed in ~200h) */
export const DECAY_RATE_PER_HOUR = 0.005;

/** Confidence gained per successful retrieval (+3% per access) */
export const BOOST_PER_ACCESS = 0.03;

/** Hard floor — never below 0.0 */
export const CONFIDENCE_MIN = 0.0;

/** Hard ceiling — never above 1.0 */
export const CONFIDENCE_MAX = 1.0;

/** Default confidence for facts with no history */
export const DEFAULT_BASE_CONFIDENCE = 0.5;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Internal state shape for confidence calculation.
 * Mapped from ExtractedFact fields — no DB schema change required.
 */
export interface ConfidenceState {
  /** Starting confidence at extraction time (0–1) */
  baseConfidence: number;
  /** Last time this fact was retrieved and used */
  lastAccessedAt: Date;
  /** Total number of times this fact has been retrieved */
  accessCount: number;
}

/**
 * Result of a confidence calculation including the effective score
 * and a human-readable breakdown for logging/debugging.
 */
export interface ConfidenceResult {
  effective: number;
  base: number;
  decayPenalty: number;
  accessBonus: number;
  hoursElapsed: number;
}

/** The three routing tiers driven by confidence */
export type ConfidenceModelTier = 'gemini-flash' | 'deepseek' | 'claude-sonnet';

/** Strategy for combining multiple fact confidence scores */
export type AggregationStrategy = 'minimum' | 'average' | 'weighted';

// ─── Core Math ───────────────────────────────────────────────────────────────

/**
 * Calculate the effective confidence of a memory state at a given time.
 *
 * @example
 * const state = { baseConfidence: 0.7, lastAccessedAt: new Date('2026-01-01'), accessCount: 5 };
 * const result = calculateEffectiveConfidence(state);
 * // result.effective → 0.7 - (hoursElapsed × 0.005) + (5 × 0.03)
 */
export function calculateEffectiveConfidence(
  state: ConfidenceState,
  now: Date = new Date()
): ConfidenceResult {
  const msElapsed = now.getTime() - state.lastAccessedAt.getTime();
  // Guard: if either timestamp is invalid (NaN), treat hoursElapsed as 0
  // so we apply no decay — conservative default, never crashes.
  const hoursElapsed = Number.isFinite(msElapsed) ? Math.max(0, msElapsed / (1000 * 60 * 60)) : 0;

  const decayPenalty = hoursElapsed * DECAY_RATE_PER_HOUR;
  const accessBonus = state.accessCount * BOOST_PER_ACCESS;
  const raw = state.baseConfidence - decayPenalty + accessBonus;
  const effective = Math.min(CONFIDENCE_MAX, Math.max(CONFIDENCE_MIN, raw));

  return {
    effective,
    base: state.baseConfidence,
    decayPenalty,
    accessBonus,
    hoursElapsed,
  };
}

/**
 * Map an ExtractedFact to a ConfidenceState.
 * Uses existing fields — no schema migration required.
 */
export function factToConfidenceState(fact: ExtractedFact): ConfidenceState {
  return {
    baseConfidence: fact.confidence ?? DEFAULT_BASE_CONFIDENCE,
    // normalizeDate handles strings (JSON), Firestore Timestamps, and real Dates
    lastAccessedAt: normalizeDate(fact.lastUsedAt ?? fact.extractedAt),
    accessCount: fact.usageCount ?? 0,
  };
}

/**
 * Get the effective confidence score for a single ExtractedFact.
 * Convenience wrapper over factToConfidenceState + calculateEffectiveConfidence.
 */
export function getFactConfidence(fact: ExtractedFact, now?: Date): number {
  return calculateEffectiveConfidence(factToConfidenceState(fact), now).effective;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Combine multiple confidence scores into a single routing signal.
 *
 * Strategy selection guidance:
 * - 'minimum'  → safest, use when any uncertain chunk could mislead the model
 * - 'average'  → use when all chunks are equally important
 * - 'weighted' → use when top retrieved chunks are more relevant than the rest
 *
 * Falls back to DEFAULT_BASE_CONFIDENCE when scores is empty.
 */
export function aggregateConfidenceScores(
  scores: number[],
  strategy: AggregationStrategy = 'minimum'
): number {
  if (scores.length === 0) return DEFAULT_BASE_CONFIDENCE;
  if (scores.length === 1) return scores[0];

  switch (strategy) {
    case 'minimum':
      return Math.min(...scores);

    case 'average':
      return scores.reduce((sum, s) => sum + s, 0) / scores.length;

    case 'weighted': {
      // Top 3 chunks carry 70% of the signal; the rest carry 30%
      const sorted = [...scores].sort((a, b) => b - a);
      const top = sorted.slice(0, 3);
      const rest = sorted.slice(3);

      const topAvg = top.reduce((sum, s) => sum + s, 0) / top.length;
      if (rest.length === 0) return topAvg;

      const restAvg = rest.reduce((sum, s) => sum + s, 0) / rest.length;
      return topAvg * 0.7 + restAvg * 0.3;
    }
  }
}

/**
 * Compute the aggregate effective confidence across a set of ExtractedFacts.
 * This is the primary entry point for the UCOL router.
 *
 * @param facts     Top retrieved memory facts for the current query
 * @param strategy  How to combine scores (default: 'minimum' — conservative)
 * @param topK      Only score the top-K facts by existing confidence (default: 5)
 */
export function computeContextConfidence(
  facts: ExtractedFact[],
  strategy: AggregationStrategy = 'minimum',
  topK = 5
): number {
  if (facts.length === 0) return DEFAULT_BASE_CONFIDENCE;

  // Sort by existing confidence descending, take top-K most relevant
  const topFacts = [...facts]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, topK);

  const scores = topFacts.map((f) => getFactConfidence(f));
  return aggregateConfidenceScores(scores, strategy);
}

// ─── Model Selection ─────────────────────────────────────────────────────────

/**
 * Select the appropriate model tier based on context confidence.
 *
 * Thresholds:
 *   > 0.85  →  gemini-flash   (known pattern, low-cost fast path)
 *   ≥ 0.50  →  deepseek       (moderate confidence, balanced reasoning)
 *   < 0.50  →  claude-sonnet  (novel / uncertain, maximum capability)
 */
export function selectModelByConfidence(confidence: number): ConfidenceModelTier {
  if (confidence > 0.85) return 'gemini-flash';
  if (confidence >= 0.50) return 'deepseek';
  return 'claude-sonnet';
}

/**
 * Estimate the relative cost weight of each tier (Gemini Flash = 1x baseline).
 * Useful for logging and cost tracking.
 */
export const MODEL_COST_WEIGHT: Record<ConfidenceModelTier, number> = {
  'gemini-flash':  1.0,
  'deepseek':      3.5,
  'claude-sonnet': 12.0,
};

/**
 * Full decision object returned by the confidence scorer.
 */
export interface ConfidenceRoutingSignal {
  /** Aggregated effective confidence across retrieved context (0–1) */
  contextConfidence: number;
  /** Recommended model tier based on confidence */
  recommendedTier: ConfidenceModelTier;
  /** Relative cost weight vs Gemini Flash baseline */
  costWeight: number;
  /** Aggregation strategy used */
  strategy: AggregationStrategy;
  /** Number of facts scored */
  factCount: number;
}

/**
 * Produce a full routing signal from a set of retrieved facts.
 * This is what AgentRouter consumes to make its confidence-aware decision.
 *
 * @example
 * const signal = scoreContextForRouting(retrievedFacts);
 * // signal.contextConfidence → 0.72
 * // signal.recommendedTier  → 'deepseek'
 * // signal.costWeight       → 3.5
 */
export function scoreContextForRouting(
  facts: ExtractedFact[],
  strategy: AggregationStrategy = 'minimum',
  topK = 5
): ConfidenceRoutingSignal {
  const contextConfidence = computeContextConfidence(facts, strategy, topK);
  const recommendedTier = selectModelByConfidence(contextConfidence);

  return {
    contextConfidence,
    recommendedTier,
    costWeight: MODEL_COST_WEIGHT[recommendedTier],
    strategy,
    factCount: Math.min(facts.length, topK),
  };
}
