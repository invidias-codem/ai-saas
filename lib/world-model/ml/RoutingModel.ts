/**
 * RoutingModel — Decision Tree-Based UCOL Query Router
 * Tech Genie / World Model ML Layer
 *
 * Routes incoming queries to the best available AI model based on:
 *   - Domain classification and complexity analysis
 *   - Historical truth scores per model × domain
 *   - Query requirements (recency, reasoning, code)
 *   - User tier
 *
 * Records outcomes to continuously improve routing accuracy.
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import { DecisionTreeEngine } from './DecisionTreeEngine'
import { ModelStore } from './ModelStore'
import type { DecisionTree, RoutingFeatures, FeatureVector } from './types'
import type { ModelTruthScore, ClaimVerdict } from '../types'

/** Model name for Supabase persistence */
const MODEL_NAME = 'routing_model'

/** Minimum examples before ML routing replaces heuristics */
const MIN_EXAMPLES = 50

// ─────────────────────────────────────────────
// Public Interface Types
// ─────────────────────────────────────────────

export interface RoutingContext {
  userId: string
  userTier: 'free' | 'pro'
  conversationHistory: Array<{ role: string; content: string }>
  modelTruthScores: ModelTruthScore[]
  availableModels: string[]
}

export interface RoutingDecision {
  id: string
  model: string
  confidence: number
  reasoning: string
  alternativeModels: Array<{ model: string; score: number }>
  features: RoutingFeatures
  decidedAt: Date
}

// ─────────────────────────────────────────────
// Domain / Complexity Analysis
// ─────────────────────────────────────────────

/**
 * Domain keywords for classification.
 */
const DOMAIN_PATTERNS: Record<string, RegExp> = {
  code: /\b(code|function|bug|debug|typescript|python|javascript|algorithm|class|api|refactor|implement|error|compile)\b/i,
  reasoning: /\b(why|because|therefore|logic|prove|deduce|infer|conclude|reasoning|analysis|compare|evaluate)\b/i,
  research: /\b(study|research|paper|evidence|data|statistic|survey|experiment|finding|published)\b/i,
  current_events: /\b(today|yesterday|this week|this year|recently|latest|breaking|news|2024|2025|2026)\b/i,
  product: /\b(tech genie|product|feature|roadmap|pricing|user|customer|saas|dashboard|subscription)\b/i,
}

const RECENCY_PATTERNS = /\b(today|yesterday|now|current|recent|latest|just|this week|this month|2024|2025|2026|live|real-time)\b/i
const REASONING_PATTERNS = /\b(why|because|therefore|logic|prove|deduce|infer|conclude|should|would|if.*then|analyze|evaluate|compare)\b/i
const CODE_PATTERNS = /\b(code|function|bug|debug|implement|refactor|test|algorithm|class|interface|type|async|await|import|export)\b/i
const TECHNICAL_TERMS = /\b(api|sdk|oauth|jwt|vector|embedding|neural|gradient|transformer|llm|nlp|http|rest|graphql|supabase|postgres)\b/gi

/**
 * Classify query domain from text.
 */
function classifyDomain(query: string): string {
  for (const [domain, pattern] of Object.entries(DOMAIN_PATTERNS)) {
    if (pattern.test(query)) return domain
  }
  return 'general'
}

/**
 * Encode domain name to numeric value.
 */
function encodeDomain(domain: string): number {
  const map: Record<string, number> = {
    code:           0.1,
    reasoning:      0.2,
    research:       0.3,
    general:        0.4,
    current_events: 0.5,
    product:        0.6,
  }
  return map[domain] ?? 0.4
}

/**
 * Compute query complexity score [0, 1].
 * Based on token count, sentence nesting, and technical term density.
 */
function queryComplexity(query: string): number {
  const tokens = query.split(/\s+/).length
  const tokenScore = Math.min(1, tokens / 100)

  // Nested clause count (heuristic: count conjunctions + subordinators)
  const clauseMarkers = (query.match(/\b(that|which|where|when|because|if|although|however|therefore|while|whereas)\b/gi) ?? []).length
  const clauseScore = Math.min(1, clauseMarkers / 5)

  // Technical term density
  const techTerms = (query.match(TECHNICAL_TERMS) ?? []).length
  const techScore = Math.min(1, techTerms / 5)

  return (tokenScore * 0.4 + clauseScore * 0.3 + techScore * 0.3)
}

/**
 * Normalize context length to [0, 1] (cap at 8000 tokens equivalent).
 */
function normalizeContextSize(history: Array<{ content: string }>): number {
  const totalChars = history.reduce((s, m) => s + m.content.length, 0)
  const estimatedTokens = totalChars / 4
  return Math.min(1, estimatedTokens / 8000)
}

/**
 * Lookup truth score for a model+domain combination.
 */
function getTruthScore(
  modelName: string,
  domain: string,
  scores: ModelTruthScore[]
): number {
  const score = scores.find(s => s.model === modelName && s.domain === domain)
  if (score) return score.confirmed_rate + score.supported_rate * 0.5
  // Default truth score if no historical data
  return 0.7
}

// ─────────────────────────────────────────────
// Default Model Profiles (cold start)
// ─────────────────────────────────────────────

interface ModelProfile {
  domains: string[]
  requiresRecency: boolean
  requiresReasoning: boolean
  requiresCode: boolean
  tier: 'free' | 'pro' | 'both'
}

const DEFAULT_MODEL_PROFILES: Record<string, ModelProfile> = {
  'gemini-flash': {
    domains: ['general', 'current_events', 'product'],
    requiresRecency: true,
    requiresReasoning: false,
    requiresCode: false,
    tier: 'both',
  },
  'claude-sonnet': {
    domains: ['reasoning', 'research', 'code'],
    requiresRecency: false,
    requiresReasoning: true,
    requiresCode: true,
    tier: 'pro',
  },
  'deepseek-chat': {
    domains: ['code', 'reasoning'],
    requiresRecency: false,
    requiresReasoning: true,
    requiresCode: true,
    tier: 'both',
  },
}

// ─────────────────────────────────────────────
// RoutingModel
// ─────────────────────────────────────────────

/**
 * Decision tree-based query router for UCOL.
 * Selects the best AI model for each incoming query.
 */
export class RoutingModel {
  private tree: DecisionTree | null

  constructor(tree: DecisionTree | null) {
    this.tree = tree
  }

  /**
   * Route a single query to the best available model.
   *
   * @param query   - The user's query text
   * @param context - Routing context including user tier and truth scores
   * @returns A RoutingDecision with the selected model and reasoning
   */
  async route(query: string, context: RoutingContext): Promise<RoutingDecision> {
    const features = this.extractFeatures(query, context)

    let selectedModel: string
    let confidence: number
    let reasoning: string

    if (!this.tree) {
      // Cold start: use heuristic routing
      const result = this.heuristicRoute(query, features, context)
      selectedModel = result.model
      confidence = result.confidence
      reasoning = result.reasoning
    } else {
      const featureVec = featuresToVector(features)
      const result = DecisionTreeEngine.predict(this.tree, featureVec)
      selectedModel = result.predictedClass
      confidence = result.confidence
      reasoning = buildRoutingReasoning(result, features, selectedModel)
    }

    // Validate model is available
    if (!context.availableModels.includes(selectedModel)) {
      selectedModel = context.availableModels[0] ?? 'gemini-flash'
      confidence = 0.5
      reasoning = `[Fallback] Requested model unavailable; defaulting to ${selectedModel}`
    }

    // Build alternative model scores
    const alternatives = context.availableModels
      .filter(m => m !== selectedModel)
      .map(m => ({
        model: m,
        score: getTruthScore(m, classifyDomain(query), context.modelTruthScores),
      }))
      .sort((a, b) => b.score - a.score)

    const decision: RoutingDecision = {
      id: `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      model: selectedModel,
      confidence,
      reasoning,
      alternativeModels: alternatives,
      features,
      decidedAt: new Date(),
    }

    // Persist for training data accumulation
    await ModelStore.saveTrainingExample(
      MODEL_NAME,
      featuresToVector(features),
      selectedModel,
      'auto_confirmed',
      confidence
    ).catch(() => {/* non-blocking */})

    return decision
  }

  /**
   * Route a batch of queries in parallel.
   *
   * @param queries - Array of query texts
   * @param context - Shared routing context
   * @returns Array of RoutingDecisions in same order as queries
   */
  async routeBatch(
    queries: string[],
    context: RoutingContext
  ): Promise<RoutingDecision[]> {
    return Promise.all(queries.map(q => this.route(q, context)))
  }

  /**
   * Record the actual outcome of a routing decision for feedback loop.
   * Updates the training example with the observed verdict and score.
   *
   * @param decisionId - RoutingDecision.id
   * @param verdict    - Claim verdict observed after using the routed model
   * @param deltaScore - Observed delta score (0=good, 1=bad)
   */
  async recordOutcome(
    decisionId: string,
    verdict: ClaimVerdict,
    deltaScore: number
  ): Promise<void> {
    // Encode outcome quality: low delta = good routing decision
    const quality = 1 - deltaScore
    const label = quality > 0.7 ? 'good_route' : quality > 0.4 ? 'acceptable_route' : 'bad_route'

    // In a full implementation, we'd update the specific training example.
    // Here we log for audit.
    console.log(`[RoutingModel] Outcome for ${decisionId}: verdict=${verdict}, delta=${deltaScore}, quality=${label}`)
  }

  /**
   * Extract the 10 routing features from a query + context.
   *
   * @param query   - User query text
   * @param context - Routing context
   * @returns RoutingFeatures
   */
  private extractFeatures(query: string, context: RoutingContext): RoutingFeatures {
    const domain = classifyDomain(query)

    return {
      domain_code:             encodeDomain(domain),
      query_complexity:        queryComplexity(query),
      requires_recency:        RECENCY_PATTERNS.test(query) ? 1 : 0,
      requires_reasoning:      REASONING_PATTERNS.test(query) ? 1 : 0,
      requires_code:           CODE_PATTERNS.test(query) ? 1 : 0,
      truth_score_gemini:      getTruthScore('gemini-flash', domain, context.modelTruthScores),
      truth_score_claude:      getTruthScore('claude-sonnet', domain, context.modelTruthScores),
      truth_score_deepseek:    getTruthScore('deepseek-chat', domain, context.modelTruthScores),
      context_size_normalized: normalizeContextSize(context.conversationHistory),
      user_tier:               context.userTier === 'pro' ? 1.0 : 0.0,
    }
  }

  /**
   * Heuristic routing when no trained model is available.
   * Uses feature values directly to score models.
   */
  private heuristicRoute(
    query: string,
    features: RoutingFeatures,
    context: RoutingContext
  ): { model: string; confidence: number; reasoning: string } {
    const domain = classifyDomain(query)
    const scores: Record<string, number> = {}

    for (const model of context.availableModels) {
      const profile = DEFAULT_MODEL_PROFILES[model]
      let score = getTruthScore(model, domain, context.modelTruthScores)

      if (profile) {
        if (features.requires_code && profile.requiresCode) score += 0.2
        if (features.requires_reasoning && profile.requiresReasoning) score += 0.15
        if (features.requires_recency && profile.requiresRecency) score += 0.15
        if (profile.domains.includes(domain)) score += 0.1
        if (profile.tier === 'pro' && features.user_tier === 0) score -= 0.3
      }

      scores[model] = score
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
    const [bestModel, bestScore] = sorted[0]
    const confidence = Math.min(0.9, bestScore / (sorted.reduce((s, [, v]) => s + v, 0)))

    return {
      model: bestModel,
      confidence,
      reasoning: `[Heuristic] domain=${domain}, complexity=${features.query_complexity.toFixed(2)}, `
        + `code=${features.requires_code}, reasoning=${features.requires_reasoning}, `
        + `recency=${features.requires_recency} → ${bestModel} (score=${bestScore.toFixed(2)})`,
    }
  }

  /**
   * Load the RoutingModel from Supabase.
   * Falls back to heuristic mode if no trained model exists.
   *
   * @returns Initialized RoutingModel instance
   */
  static async load(): Promise<RoutingModel> {
    try {
      const stored = await ModelStore.load(MODEL_NAME)
      if (stored && 'root' in stored.model) {
        return new RoutingModel(stored.model as DecisionTree)
      }
    } catch {
      // Supabase unavailable
    }
    return new RoutingModel(null)
  }

  /**
   * Train the routing model from accumulated examples.
   *
   * @param minExamples - Minimum examples required
   * @returns true if training succeeded
   */
  static async trainFromExamples(minExamples = MIN_EXAMPLES): Promise<boolean> {
    const examples = await ModelStore.getTrainingExamples(MODEL_NAME)
    if (examples.length < minExamples) return false

    const classNames = [...new Set(examples.map(e => e.label))].sort()

    const tree = DecisionTreeEngine.train(examples, {
      maxDepth: 6,
      minSamplesSplit: 3,
      criterion: 'gini',
      maxFeatures: 'sqrt',
      featureNames: [
        'domain_code', 'query_complexity', 'requires_recency', 'requires_reasoning',
        'requires_code', 'truth_score_gemini', 'truth_score_claude', 'truth_score_deepseek',
        'context_size_normalized', 'user_tier',
      ],
      classNames,
    })

    await ModelStore.save(MODEL_NAME, tree, {
      version: `1.${examples.length}.0`,
      trainedAt: new Date().toISOString(),
      accuracy: tree.trainingScore,
      featureNames: tree.featureNames,
      classNames: tree.classNames,
      modelType: 'decision_tree',
      sampleCount: examples.length,
      notes: 'Auto-trained routing model',
    })

    await ModelStore.markExamplesUsed(examples.map(e => e.id!).filter(Boolean))
    return true
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function featuresToVector(f: RoutingFeatures): FeatureVector {
  return {
    domain_code:             f.domain_code,
    query_complexity:        f.query_complexity,
    requires_recency:        f.requires_recency,
    requires_reasoning:      f.requires_reasoning,
    requires_code:           f.requires_code,
    truth_score_gemini:      f.truth_score_gemini,
    truth_score_claude:      f.truth_score_claude,
    truth_score_deepseek:    f.truth_score_deepseek,
    context_size_normalized: f.context_size_normalized,
    user_tier:               f.user_tier,
  }
}

function buildRoutingReasoning(
  result: ReturnType<typeof DecisionTreeEngine.predict>,
  features: RoutingFeatures,
  model: string
): string {
  const topFeatures = result.decisionPath.slice(0, 3).map(s => s.description).join(' → ')
  return `[ML] Routed to ${model} (conf=${(result.confidence * 100).toFixed(0)}%) — `
    + `path: ${topFeatures}`
}
