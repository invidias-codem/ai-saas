/**
 * SimulationPredictor — ML-Based World State Prediction
 * Tech Genie / World Model ML Layer
 *
 * Predicts future world states given a current state and proposed action.
 * Powers the simulation engine for counterfactual analysis and scenario planning.
 *
 * Features (8):
 *   - current_metric_normalized
 *   - action_type_code
 *   - similar_action_outcome_avg
 *   - causal_chain_strength
 *   - time_horizon_days
 *   - volatility_score
 *   - support_edge_count
 *   - contradiction_edge_count
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import { RandomForest } from './RandomForest'
import { ModelStore } from './ModelStore'
import type {
  EnsembleModel,
  SimulationFeatures,
  FeatureVector,
} from './types'
import type {
  SimulationInput,
  SimulationResult,
  PredictedState,
  SimulationHorizon,
  WorldState,
  CausalEdge,
  AttributeValue,
} from '../types'

/** Model name for Supabase persistence */
const MODEL_NAME = 'simulation_predictor'

/** Minimum examples before ML replaces heuristics */
const MIN_EXAMPLES = 50

// ─────────────────────────────────────────────
// Public Interface Types
// ─────────────────────────────────────────────

export interface KeyDriver {
  feature: string
  importance: number
  direction: 'positive' | 'negative'
  explanation: string
}

// ─────────────────────────────────────────────
// Action Type Encoding
// ─────────────────────────────────────────────

/**
 * Encode a natural-language proposed action to a numeric code.
 * Used as feature: action_type_code.
 */
const ACTION_PATTERNS: Array<[RegExp, number]> = [
  [/price|pricing|subscription|tier|cost/i,    0.1],
  [/feature|add|build|implement|deploy/i,       0.2],
  [/marketing|advertise|campaign|outreach/i,    0.3],
  [/hire|team|staff|resource|onboard/i,         0.4],
  [/remove|delete|deprecate|sunset|kill/i,      0.5],
  [/optimize|improve|refactor|upgrade/i,        0.6],
  [/partner|integrate|connect|collaborate/i,    0.7],
  [/scale|expand|grow|launch|rollout/i,         0.8],
]

function encodeActionType(action: string): number {
  for (const [pattern, code] of ACTION_PATTERNS) {
    if (pattern.test(action)) return code
  }
  return 0.5 // general action
}

// ─────────────────────────────────────────────
// Horizon Encoding
// ─────────────────────────────────────────────

const HORIZON_DAYS: Record<SimulationHorizon, number> = {
  '7d':   7,
  '30d':  30,
  '90d':  90,
  '180d': 180,
  '1y':   365,
}

/** Normalize horizon: 7 days = 0.1, 365 days = 1.0 */
function normalizeHorizon(horizon: SimulationHorizon): number {
  const days = HORIZON_DAYS[horizon]
  return Math.min(1, days / 365)
}

// ─────────────────────────────────────────────
// Metric Normalization
// ─────────────────────────────────────────────

/**
 * Extract a primary numeric metric from a WorldState and normalize it.
 * Uses the first numeric attribute found, normalized by its historical context.
 */
function extractNormalizedMetric(state: WorldState): number {
  for (const [, attr] of Object.entries(state.attributes)) {
    if (typeof attr.value === 'number') {
      // Normalize by confidence (proxy for "how extreme is this value")
      return Math.min(1, Math.max(0, attr.confidence))
    }
  }
  return 0.5
}

/**
 * Compute a volatility score from attribute history snapshots.
 * Uses the confidence spread as a proxy for historical variance.
 */
function computeVolatility(state: WorldState): number {
  const numericAttrs = Object.values(state.attributes).filter(
    a => typeof a.value === 'number'
  )
  if (numericAttrs.length === 0) return 0.3

  const confidences = numericAttrs.map(a => a.confidence)
  const mean = confidences.reduce((s, v) => s + v, 0) / confidences.length
  const variance = confidences.reduce((s, v) => s + (v - mean) ** 2, 0) / confidences.length
  return Math.min(1, Math.sqrt(variance) * 3)
}

/**
 * Find similar past actions in the causal graph and compute their average outcome.
 * Returns the average causal_strength of relevant CAUSES edges.
 */
function similarActionOutcomeAvg(
  action: string,
  edges: CausalEdge[]
): number {
  const causesEdges = edges.filter(
    e => e.relationship_type === 'CAUSES' && e.causal_strength !== undefined
  )
  if (causesEdges.length === 0) return 0.5

  // Use all CAUSES edges as proxies for "past action outcomes"
  const strengths = causesEdges.map(e => e.causal_strength ?? 0.5)
  return strengths.reduce((s, v) => s + v, 0) / strengths.length
}

/**
 * Compute aggregate causal chain strength along the path
 * from action to goal metric.
 */
function causalChainStrength(edges: CausalEdge[]): number {
  const causesEdges = edges.filter(
    e => e.relationship_type === 'CAUSES' || e.relationship_type === 'PRECEDES'
  )
  if (causesEdges.length === 0) return 0.3

  const strengths = causesEdges.map(e => e.causal_strength ?? e.confidence)
  // Use geometric mean to penalize weak links in the chain
  const logSum = strengths.reduce((s, v) => s + Math.log(Math.max(0.001, v)), 0)
  return Math.exp(logSum / strengths.length)
}

function featuresToVector(f: SimulationFeatures): FeatureVector {
  return {
    current_metric_normalized:    f.current_metric_normalized,
    action_type_code:             f.action_type_code,
    similar_action_outcome_avg:   f.similar_action_outcome_avg,
    causal_chain_strength:        f.causal_chain_strength,
    time_horizon_days:            f.time_horizon_days,
    volatility_score:             f.volatility_score,
    support_edge_count:           f.support_edge_count,
    contradiction_edge_count:     f.contradiction_edge_count,
  }
}

// ─────────────────────────────────────────────
// Outcome classes (discretized probability bins)
// ─────────────────────────────────────────────

const OUTCOME_CLASSES = [
  'strongly_negative',  // cost_score > 0.8
  'negative',           // cost_score 0.6-0.8
  'neutral',            // cost_score 0.4-0.6
  'positive',           // cost_score 0.2-0.4
  'strongly_positive',  // cost_score < 0.2
] as const

type OutcomeClass = typeof OUTCOME_CLASSES[number]

const OUTCOME_TO_COST: Record<OutcomeClass, number> = {
  strongly_negative: 0.9,
  negative:          0.7,
  neutral:           0.5,
  positive:          0.3,
  strongly_positive: 0.1,
}

// ─────────────────────────────────────────────
// State Generation
// ─────────────────────────────────────────────

/**
 * Generate a predicted WorldState by applying an outcome class
 * to the current state's attributes.
 */
function generatePredictedState(
  current: WorldState,
  outcome: OutcomeClass,
  horizon: SimulationHorizon,
  probability: number,
  causalChain: CausalEdge[],
  action: string
): PredictedState {
  const factor = {
    strongly_negative: 0.4,
    negative:          0.7,
    neutral:           1.0,
    positive:          1.3,
    strongly_positive: 1.6,
  }[outcome]

  // Project attributes
  const projectedAttributes: Record<string, AttributeValue> = {}
  for (const [key, attr] of Object.entries(current.attributes)) {
    projectedAttributes[key] = {
      ...attr,
      value: typeof attr.value === 'number'
        ? Math.round(attr.value * factor * 100) / 100
        : attr.value,
      confidence: Math.max(0.1, attr.confidence * (1 - HORIZON_DAYS[horizon] / 730)),
      recorded_at: new Date(),
      source: `simulation:${MODEL_NAME}`,
    }
  }

  const projectedState: WorldState = {
    entity_id:   current.entity_id,
    entity_name: current.entity_name,
    captured_at: new Date(),
    attributes:  projectedAttributes,
    active_edges: causalChain,
  }

  return {
    horizon,
    probability,
    state: projectedState,
    causal_chain: causalChain,
    cost_score: OUTCOME_TO_COST[outcome],
    explanation: buildStateExplanation(outcome, action, horizon, probability),
  }
}

function buildStateExplanation(
  outcome: OutcomeClass,
  action: string,
  horizon: SimulationHorizon,
  probability: number
): string {
  const outcomeDescriptions: Record<OutcomeClass, string> = {
    strongly_positive: 'significantly improves the target metric',
    positive:          'moderately improves the target metric',
    neutral:           'has minimal net effect on the target metric',
    negative:          'slightly worsens the target metric',
    strongly_negative: 'significantly worsens the target metric',
  }
  return `Within ${horizon}, action "${action}" ${outcomeDescriptions[outcome]}. `
    + `Probability: ${(probability * 100).toFixed(0)}%.`
}

// ─────────────────────────────────────────────
// SimulationPredictor
// ─────────────────────────────────────────────

/**
 * ML-powered world state predictor.
 * Given a current state and proposed action, predicts outcomes across time horizons.
 *
 * Usage:
 *   const predictor = await SimulationPredictor.load()
 *   const result = await predictor.predict(simulationInput)
 */
export class SimulationPredictor {
  private model: EnsembleModel | null

  constructor(model: EnsembleModel | null) {
    this.model = model
  }

  /**
   * Predict the outcome of a proposed action for the default horizons.
   * Returns the highest-probability predicted state for each horizon.
   *
   * @param input - Simulation input with current state, action, and goal
   * @returns Full SimulationResult with predicted states and recommendation
   */
  async predict(input: SimulationInput): Promise<SimulationResult> {
    const horizons = input.horizons ?? ['30d', '90d', '1y']
    const allStates: PredictedState[] = []

    for (const horizon of horizons) {
      const states = await this.predictDistribution(input, horizon)
      allStates.push(...states)
    }

    // Best state: lowest cost_score
    const best = allStates.reduce((b, s) => s.cost_score < b.cost_score ? s : b, allStates[0])
    const recommendedHorizon = best?.horizon ?? '90d'

    const confidence = best ? best.probability : 0.5
    const recommendation = buildRecommendation(
      input.proposedAction,
      input.goal,
      best,
      allStates
    )

    return {
      input,
      predicted_states:      allStates,
      recommended_horizon:   recommendedHorizon,
      recommendation,
      confidence,
      simulated_at:          new Date(),
    }
  }

  /**
   * Predict the full probability distribution over outcomes for a specific horizon.
   * Returns one PredictedState per outcome class.
   *
   * @param input   - Simulation input
   * @param horizon - Time horizon to predict for
   * @returns Array of PredictedState objects with probabilities
   */
  async predictDistribution(
    input: SimulationInput,
    horizon: SimulationHorizon
  ): Promise<PredictedState[]> {
    const features = this.extractFeatures(input, horizon)
    const causalChain = input.currentState.active_edges.filter(
      e => e.relationship_type === 'CAUSES' || e.relationship_type === 'PRECEDES'
    )

    let classProbabilities: Record<string, number>

    if (!this.model) {
      classProbabilities = this.heuristicProbabilities(features)
    } else {
      const featureVec = featuresToVector(features)
      const result = RandomForest.predict(this.model, featureVec)
      classProbabilities = result.probabilities
    }

    // Build predicted state for each outcome class
    const states: PredictedState[] = []

    for (const outcomeClass of OUTCOME_CLASSES) {
      const probability = classProbabilities[outcomeClass] ?? 0

      if (probability < 0.05) continue // skip very unlikely outcomes

      const state = generatePredictedState(
        input.currentState,
        outcomeClass,
        horizon,
        probability,
        causalChain,
        input.proposedAction
      )
      states.push(state)
    }

    // Normalize probabilities to sum to 1
    const totalProb = states.reduce((s, st) => s + st.probability, 0)
    if (totalProb > 0) {
      for (const state of states) {
        state.probability = state.probability / totalProb
      }
    }

    return states.sort((a, b) => b.probability - a.probability)
  }

  /**
   * Identify the key drivers of predicted simulation outcomes.
   * Returns features sorted by importance with directional analysis.
   *
   * @param input - Simulation input
   * @returns Array of KeyDriver objects sorted by importance descending
   */
  async identifyKeyDrivers(input: SimulationInput): Promise<KeyDriver[]> {
    if (!this.model) {
      return this.heuristicKeyDrivers(input)
    }

    const features = this.extractFeatures(input, '90d')
    const featureVec = featuresToVector(features)
    const result = RandomForest.predict(this.model, featureVec)

    return Object.entries(result.featureImportances)
      .sort((a, b) => b[1] - a[1])
      .map(([feature, importance]) => {
        const value = featureVec[feature] ?? 0
        const direction: 'positive' | 'negative' = value > 0.5 ? 'positive' : 'negative'

        return {
          feature,
          importance,
          direction,
          explanation: buildDriverExplanation(feature, value, direction, importance),
        }
      })
  }

  /**
   * Extract the 8 simulation features from the input.
   *
   * @param input   - Simulation input
   * @param horizon - Time horizon
   * @returns SimulationFeatures
   */
  private extractFeatures(input: SimulationInput, horizon: SimulationHorizon): SimulationFeatures {
    const { currentState, proposedAction } = input
    const edges = currentState.active_edges

    // Support and contradiction counts from active edges
    const supportEdgeCount = Math.min(1,
      edges.filter(e => e.relationship_type === 'SUPPORTS').length / 10
    )
    const contradictionEdgeCount = Math.min(1,
      edges.filter(e => e.relationship_type === 'CONTRADICTS').length / 5
    )

    return {
      current_metric_normalized:  extractNormalizedMetric(currentState),
      action_type_code:           encodeActionType(proposedAction),
      similar_action_outcome_avg: similarActionOutcomeAvg(proposedAction, edges),
      causal_chain_strength:      causalChainStrength(edges),
      time_horizon_days:          normalizeHorizon(horizon),
      volatility_score:           computeVolatility(currentState),
      support_edge_count:         supportEdgeCount,
      contradiction_edge_count:   contradictionEdgeCount,
    }
  }

  /**
   * Heuristic probability distribution when no model is available.
   */
  private heuristicProbabilities(
    features: SimulationFeatures
  ): Record<string, number> {
    // Start from neutral and adjust based on features
    const base = {
      strongly_positive: 0.1,
      positive:          0.2,
      neutral:           0.4,
      negative:          0.2,
      strongly_negative: 0.1,
    }

    // Good signals
    const positiveSignal =
      features.causal_chain_strength * 0.3 +
      features.similar_action_outcome_avg * 0.2 +
      features.support_edge_count * 0.2 -
      features.contradiction_edge_count * 0.3 -
      features.volatility_score * 0.1

    // Adjust toward positive or negative based on signal
    const shift = Math.max(-0.15, Math.min(0.15, positiveSignal))

    return {
      strongly_positive: Math.max(0, base.strongly_positive + shift),
      positive:          Math.max(0, base.positive + shift * 0.5),
      neutral:           Math.max(0, base.neutral - Math.abs(shift)),
      negative:          Math.max(0, base.negative - shift * 0.5),
      strongly_negative: Math.max(0, base.strongly_negative - shift),
    }
  }

  /** Heuristic key drivers when no model is available */
  private heuristicKeyDrivers(input: SimulationInput): KeyDriver[] {
    const features = this.extractFeatures(input, '90d')
    const featureVec = featuresToVector(features)

    // Assign rough importance weights
    const importance: Record<string, number> = {
      causal_chain_strength:        0.25,
      similar_action_outcome_avg:   0.20,
      contradiction_edge_count:     0.15,
      volatility_score:             0.15,
      support_edge_count:           0.10,
      current_metric_normalized:    0.08,
      action_type_code:             0.05,
      time_horizon_days:            0.02,
    }

    return Object.entries(importance)
      .sort((a, b) => b[1] - a[1])
      .map(([feature, imp]) => {
        const value = featureVec[feature] ?? 0
        const direction: 'positive' | 'negative' = value > 0.5 ? 'positive' : 'negative'
        return {
          feature,
          importance: imp,
          direction,
          explanation: buildDriverExplanation(feature, value, direction, imp),
        }
      })
  }

  /**
   * Load the SimulationPredictor from Supabase.
   * Falls back to heuristic mode if no trained model exists.
   *
   * @returns Initialized SimulationPredictor instance
   */
  static async load(): Promise<SimulationPredictor> {
    try {
      const stored = await ModelStore.load(MODEL_NAME)
      if (stored && 'trees' in stored.model) {
        return new SimulationPredictor(stored.model as EnsembleModel)
      }
    } catch {
      // Supabase unavailable
    }
    return new SimulationPredictor(null)
  }

  /**
   * Train the simulation predictor from accumulated examples.
   *
   * @param minExamples - Minimum examples required
   * @returns true if training succeeded
   */
  static async trainFromExamples(minExamples = MIN_EXAMPLES): Promise<boolean> {
    const examples = await ModelStore.getTrainingExamples(MODEL_NAME)
    if (examples.length < minExamples) return false

    const model = RandomForest.train(examples, {
      nEstimators: 60,
      maxDepth: 7,
      minSamplesSplit: 4,
      maxFeatures: 'sqrt',
      criterion: 'gini',
      featureNames: [
        'current_metric_normalized', 'action_type_code', 'similar_action_outcome_avg',
        'causal_chain_strength', 'time_horizon_days', 'volatility_score',
        'support_edge_count', 'contradiction_edge_count',
      ],
      classNames: [...OUTCOME_CLASSES],
    })

    await ModelStore.save(MODEL_NAME, model, {
      version: `1.${examples.length}.0`,
      trainedAt: new Date().toISOString(),
      accuracy: 1 - (model.oobError ?? 0),
      featureNames: model.featureNames,
      classNames: [...OUTCOME_CLASSES],
      modelType: 'random_forest',
      sampleCount: examples.length,
      notes: 'Auto-trained simulation predictor',
    })

    await ModelStore.markExamplesUsed(examples.map(e => e.id!).filter(Boolean))
    return true
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildRecommendation(
  action: string,
  goal: string,
  best: PredictedState | undefined,
  allStates: PredictedState[]
): string {
  if (!best) {
    return `Unable to simulate "${action}". Insufficient causal graph data for "${goal}".`
  }

  const isPositive = best.cost_score < 0.4
  const highConf = best.probability > 0.5

  if (isPositive && highConf) {
    return `"${action}" is predicted to help achieve "${goal}" with ${(best.probability * 100).toFixed(0)}% probability over ${best.horizon}. ${best.explanation}`
  }

  if (!isPositive) {
    const alternatives = allStates
      .filter(s => s.cost_score < 0.4 && s !== best)
      .slice(0, 1)
    const altNote = alternatives.length > 0
      ? ` Consider adjusting the approach for better outcomes at ${alternatives[0].horizon}.`
      : ''
    return `"${action}" is unlikely to achieve "${goal}" (cost_score=${best.cost_score.toFixed(2)}).${altNote}`
  }

  return `"${action}" may contribute to "${goal}" but outcomes are uncertain (${(best.probability * 100).toFixed(0)}% confidence). Monitor ${best.horizon} closely.`
}

function buildDriverExplanation(
  feature: string,
  value: number,
  direction: 'positive' | 'negative',
  importance: number
): string {
  const descriptions: Record<string, string> = {
    causal_chain_strength:        `causal chain strength (${(value * 100).toFixed(0)}%) ${direction === 'positive' ? 'supports' : 'weakens'} the action's impact`,
    similar_action_outcome_avg:   `similar past actions had ${direction === 'positive' ? 'good' : 'poor'} outcomes (avg=${(value * 100).toFixed(0)}%)`,
    contradiction_edge_count:     `${direction === 'negative' ? 'few' : 'many'} contradicting signals in the graph`,
    volatility_score:             `metric volatility is ${direction === 'positive' ? 'high' : 'low'} (${(value * 100).toFixed(0)}%)`,
    support_edge_count:           `${direction === 'positive' ? 'strong' : 'weak'} support evidence in the graph`,
    current_metric_normalized:    `current metric is at ${(value * 100).toFixed(0)}% of historical range`,
    action_type_code:             `action category (code=${value.toFixed(2)})`,
    time_horizon_days:            `time horizon (${(value * 365).toFixed(0)} days)`,
  }

  const desc = descriptions[feature] ?? `${feature} = ${value.toFixed(2)}`
  return `${desc} [importance ${(importance * 100).toFixed(0)}%]`
}
