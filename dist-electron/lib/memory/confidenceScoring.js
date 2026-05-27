"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_COST_WEIGHT = exports.DEFAULT_BASE_CONFIDENCE = exports.CONFIDENCE_MAX = exports.CONFIDENCE_MIN = exports.BOOST_PER_ACCESS = exports.DECAY_RATE_PER_HOUR = void 0;
exports.normalizeDate = normalizeDate;
exports.calculateEffectiveConfidence = calculateEffectiveConfidence;
exports.factToConfidenceState = factToConfidenceState;
exports.getFactConfidence = getFactConfidence;
exports.aggregateConfidenceScores = aggregateConfidenceScores;
exports.computeContextConfidence = computeContextConfidence;
exports.selectModelByConfidence = selectModelByConfidence;
exports.scoreContextForRouting = scoreContextForRouting;
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
function normalizeDate(input) {
    if (input == null)
        return new Date();
    // Already a Date — validate it
    if (input instanceof Date) {
        return isNaN(input.getTime()) ? new Date() : input;
    }
    // String or number — parse it
    if (typeof input === 'string' || typeof input === 'number') {
        const d = new Date(input);
        return isNaN(d.getTime()) ? new Date() : d;
    }
    // Firestore Timestamp (has toDate() method)
    if (typeof input.toDate === 'function') {
        try {
            const d = input.toDate();
            return d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
        }
        catch {
            return new Date();
        }
    }
    return new Date(); // Unknown shape — treat as now (no decay)
}
// ─── Constants ────────────────────────────────────────────────────────────────
/** Confidence lost per hour without access (0.5%/hr → fully decayed in ~200h) */
exports.DECAY_RATE_PER_HOUR = 0.005;
/** Confidence gained per successful retrieval (+3% per access) */
exports.BOOST_PER_ACCESS = 0.03;
/** Hard floor — never below 0.0 */
exports.CONFIDENCE_MIN = 0.0;
/** Hard ceiling — never above 1.0 */
exports.CONFIDENCE_MAX = 1.0;
/** Default confidence for facts with no history */
exports.DEFAULT_BASE_CONFIDENCE = 0.5;
// ─── Core Math ───────────────────────────────────────────────────────────────
/**
 * Calculate the effective confidence of a memory state at a given time.
 *
 * @example
 * const state = { baseConfidence: 0.7, lastAccessedAt: new Date('2026-01-01'), accessCount: 5 };
 * const result = calculateEffectiveConfidence(state);
 * // result.effective → 0.7 - (hoursElapsed × 0.005) + (5 × 0.03)
 */
function calculateEffectiveConfidence(state, now = new Date()) {
    const msElapsed = now.getTime() - state.lastAccessedAt.getTime();
    // Guard: if either timestamp is invalid (NaN), treat hoursElapsed as 0
    // so we apply no decay — conservative default, never crashes.
    const hoursElapsed = Number.isFinite(msElapsed) ? Math.max(0, msElapsed / (1000 * 60 * 60)) : 0;
    const decayPenalty = hoursElapsed * exports.DECAY_RATE_PER_HOUR;
    const accessBonus = state.accessCount * exports.BOOST_PER_ACCESS;
    const raw = state.baseConfidence - decayPenalty + accessBonus;
    const effective = Math.min(exports.CONFIDENCE_MAX, Math.max(exports.CONFIDENCE_MIN, raw));
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
function factToConfidenceState(fact) {
    return {
        baseConfidence: fact.confidence ?? exports.DEFAULT_BASE_CONFIDENCE,
        // normalizeDate handles strings (JSON), Firestore Timestamps, and real Dates
        lastAccessedAt: normalizeDate(fact.lastUsedAt ?? fact.extractedAt),
        accessCount: fact.usageCount ?? 0,
    };
}
/**
 * Get the effective confidence score for a single ExtractedFact.
 * Convenience wrapper over factToConfidenceState + calculateEffectiveConfidence.
 */
function getFactConfidence(fact, now) {
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
function aggregateConfidenceScores(scores, strategy = 'minimum') {
    if (scores.length === 0)
        return exports.DEFAULT_BASE_CONFIDENCE;
    if (scores.length === 1)
        return scores[0];
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
            if (rest.length === 0)
                return topAvg;
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
function computeContextConfidence(facts, strategy = 'minimum', topK = 5) {
    if (facts.length === 0)
        return exports.DEFAULT_BASE_CONFIDENCE;
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
function selectModelByConfidence(confidence) {
    if (confidence > 0.85)
        return 'gemini-flash';
    if (confidence >= 0.50)
        return 'deepseek';
    return 'claude-sonnet';
}
/**
 * Estimate the relative cost weight of each tier (Gemini Flash = 1x baseline).
 * Useful for logging and cost tracking.
 */
exports.MODEL_COST_WEIGHT = {
    'gemini-flash': 1.0,
    'deepseek': 3.5,
    'claude-sonnet': 12.0,
};
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
function scoreContextForRouting(facts, strategy = 'minimum', topK = 5) {
    const contextConfidence = computeContextConfidence(facts, strategy, topK);
    const recommendedTier = selectModelByConfidence(contextConfidence);
    return {
        contextConfidence,
        recommendedTier,
        costWeight: exports.MODEL_COST_WEIGHT[recommendedTier],
        strategy,
        factCount: Math.min(facts.length, topK),
    };
}
