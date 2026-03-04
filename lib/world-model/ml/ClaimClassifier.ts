/**
 * ClaimClassifier — ML-Based Claim Verdict Classification
 * Tech Genie / World Model ML Layer
 *
 * Classifies AI output claims against the world state knowledge graph.
 * Uses a Random Forest ensemble trained on 10 features derived from graph context.
 *
 * Cold-start strategy:
 *   - If no trained model exists (< 100 examples), use ruleBasedFallback()
 *   - Once 100+ examples accumulate, train the first model
 *   - Continuously improve via online learning loop
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import { RandomForest } from './RandomForest'
import { ModelStore } from './ModelStore'
import type {
  EnsembleModel,
  ClaimVerdictFeatures,
  FeatureVector,
  TrainingExample,
} from './types'
import type {
  ClaimVerdict,
  ClaimAuditResult,
  TemporalKnowledgeNode,
  CausalEdge,
  ModelTruthScore,
} from '../types'

/** Minimum training examples before we switch from rule-based to ML */
const MIN_EXAMPLES_FOR_TRAINING = 100

/** Model name used in Supabase ml_models table */
const MODEL_NAME = 'claim_classifier'

// ─────────────────────────────────────────────
// GraphContext
// ─────────────────────────────────────────────

export interface GraphContext {
  nodes: TemporalKnowledgeNode[]
  edges: CausalEdge[]
  modelTruthScores: ModelTruthScore[]
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Cosine similarity between two numeric vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/** Normalize days: 0 = today, 1 = 365+ days */
function normalizeDays(ageMs: number): number {
  const days = ageMs / (1000 * 60 * 60 * 24)
  return Math.min(1, days / 365)
}

/** Source type → numeric score */
function sourceTypeScore(type: TemporalKnowledgeNode['source_type']): number {
  switch (type) {
    case 'verified': return 1.0
    case 'system':   return 0.8
    case 'external': return 0.7
    case 'user':     return 0.6
    case 'inferred': return 0.4
    default:         return 0.5
  }
}

/** Simple BFS shortest path length in edge graph */
function shortestPathLength(
  fromId: string,
  toId: string,
  edges: CausalEdge[],
  maxDepth = 6
): number {
  if (fromId === toId) return 0
  const visited = new Set<string>([fromId])
  const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (curr.depth >= maxDepth) continue

    for (const edge of edges) {
      const neighbor =
        edge.source_id === curr.id ? edge.target_id :
        edge.target_id === curr.id ? edge.source_id : null

      if (!neighbor) continue
      if (neighbor === toId) return curr.depth + 1
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push({ id: neighbor, depth: curr.depth + 1 })
      }
    }
  }

  return maxDepth // not found: return max as "far"
}

/** Verdict labels in order (used as class names for the model) */
const VERDICT_CLASSES: ClaimVerdict[] = [
  'CONFIRMED',
  'SUPPORTED',
  'UNVERIFIED',
  'CONTRADICTED',
  'MISATTRIBUTED',
  'OUTDATED',
]

/**
 * Features → FeatureVector (typed to string keys required by CART)
 */
function featuresToVector(f: ClaimVerdictFeatures): FeatureVector {
  return {
    embedding_similarity:     f.embedding_similarity,
    source_confidence:        f.source_confidence,
    source_age_days:          f.source_age_days,
    source_type_score:        f.source_type_score,
    speaker_match:            f.speaker_match,
    temporal_validity:        f.temporal_validity,
    contradiction_count:      f.contradiction_count,
    support_count:            f.support_count,
    causal_distance:          f.causal_distance,
    domain_hallucination_rate: f.domain_hallucination_rate,
  }
}

// ─────────────────────────────────────────────
// ClaimClassifier
// ─────────────────────────────────────────────

/**
 * Classifies AI output claims against the world state graph using a Random Forest.
 *
 * Usage:
 *   const classifier = await ClaimClassifier.load()
 *   const result = await classifier.classify(claimText, graphContext, 'gemini-flash', 'research')
 */
export class ClaimClassifier {
  private model: EnsembleModel | null

  constructor(model: EnsembleModel | null) {
    this.model = model
  }

  /**
   * Extract the 10 ML features for a claim from the graph context.
   * This is the feature engineering step.
   *
   * @param claim       - Raw claim text
   * @param graphContext - Knowledge graph nodes, edges, and model truth scores
   * @param modelName   - AI model that produced the claim
   * @param domain      - Knowledge domain (e.g. 'research', 'code')
   * @returns Structured ClaimVerdictFeatures
   */
  async extractFeatures(
    claim: string,
    graphContext: GraphContext,
    modelName: string,
    domain: string
  ): Promise<ClaimVerdictFeatures> {
    const { nodes, edges, modelTruthScores } = graphContext
    const now = new Date()

    // ── Feature 1: embedding_similarity ──────────────────────────────────
    // Find the node whose content most closely matches the claim.
    // We use a simple keyword overlap as a proxy when no embeddings are stored.
    let bestNode: TemporalKnowledgeNode | null = null
    let embeddingSimilarity = 0

    const claimWords = new Set(
      claim.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    )

    for (const node of nodes) {
      if (node.embedding && node.embedding.length > 0) {
        // Use real cosine similarity if embedding is available
        // We can't embed the claim here without an async call,
        // so we fall back to text similarity as an approximation.
      }
      // Text overlap similarity as proxy
      const nodeWords = new Set(
        node.content.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3)
      )
      const overlap = [...claimWords].filter(w => nodeWords.has(w)).length
      const union = new Set([...claimWords, ...nodeWords]).size
      const jaccard = union > 0 ? overlap / union : 0

      if (jaccard > embeddingSimilarity) {
        embeddingSimilarity = jaccard
        bestNode = node
      }
    }

    // ── Feature 2: source_confidence ─────────────────────────────────────
    const sourceConfidence = bestNode?.confidence ?? 0

    // ── Feature 3: source_age_days ────────────────────────────────────────
    const sourceAgeDays = bestNode
      ? normalizeDays(now.getTime() - new Date(bestNode.valid_from).getTime())
      : 1.0

    // ── Feature 4: source_type_score ──────────────────────────────────────
    const sourceTypeScoreVal = bestNode ? sourceTypeScore(bestNode.source_type) : 0

    // ── Feature 5: speaker_match ──────────────────────────────────────────
    // Look for ASSERTED_BY edge from best node's id
    let speakerMatch = 0
    if (bestNode) {
      const assertionEdge = edges.find(
        e => e.source_id === bestNode!.id && e.relationship_type === 'ASSERTED_BY'
      )
      // If there's an explicit attribution edge, assume it matches unless we have
      // contradicting evidence. Simple heuristic: presence of attribution = match.
      speakerMatch = assertionEdge ? 1 : 0
    }

    // ── Feature 6: temporal_validity ─────────────────────────────────────
    let temporalValidity = 1.0
    if (bestNode?.valid_until) {
      temporalValidity = new Date(bestNode.valid_until) > now ? 1.0 : 0.0
    }
    // superseded_by present → outdated
    if (bestNode?.superseded_by) temporalValidity = 0.0

    // ── Feature 7: contradiction_count ───────────────────────────────────
    const contradictions = bestNode
      ? edges.filter(
          e =>
            (e.source_id === bestNode!.id || e.target_id === bestNode!.id) &&
            e.relationship_type === 'CONTRADICTS'
        ).length
      : 0
    const contradictionCount = Math.min(1, contradictions / 5)

    // ── Feature 8: support_count ──────────────────────────────────────────
    const supports = bestNode
      ? edges.filter(
          e =>
            (e.source_id === bestNode!.id || e.target_id === bestNode!.id) &&
            e.relationship_type === 'SUPPORTS'
        ).length
      : 0
    const supportCount = Math.min(1, supports / 5)

    // ── Feature 9: causal_distance ────────────────────────────────────────
    // Use shortest path from root-like nodes to best node
    let causalDistance = 1.0
    if (bestNode && nodes.length > 0) {
      // Find node with most outgoing causal edges as proxy for "root"
      const outDegree: Record<string, number> = {}
      for (const edge of edges) {
        if (edge.relationship_type === 'CAUSES') {
          outDegree[edge.source_id] = (outDegree[edge.source_id] ?? 0) + 1
        }
      }
      const rootCandidates = Object.entries(outDegree)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id)

      const minDist = rootCandidates.reduce((min, rootId) => {
        const d = shortestPathLength(rootId, bestNode!.id, edges)
        return Math.min(min, d)
      }, 6)

      causalDistance = Math.min(1, minDist / 6)
    }

    // ── Feature 10: domain_hallucination_rate ─────────────────────────────
    const modelScore = modelTruthScores.find(
      s => s.model === modelName && s.domain === domain
    )
    const domainHallucinationRate = modelScore?.hallucination_rate ?? 0.2

    return {
      embedding_similarity:     Math.min(1, Math.max(0, embeddingSimilarity)),
      source_confidence:        Math.min(1, Math.max(0, sourceConfidence)),
      source_age_days:          Math.min(1, Math.max(0, sourceAgeDays)),
      source_type_score:        Math.min(1, Math.max(0, sourceTypeScoreVal)),
      speaker_match:            speakerMatch,
      temporal_validity:        temporalValidity,
      contradiction_count:      Math.min(1, Math.max(0, contradictionCount)),
      support_count:            Math.min(1, Math.max(0, supportCount)),
      causal_distance:          Math.min(1, Math.max(0, causalDistance)),
      domain_hallucination_rate: Math.min(1, Math.max(0, domainHallucinationRate)),
    }
  }

  /**
   * Classify a single claim against the world state.
   *
   * @param claim        - Raw claim text from AI output
   * @param graphContext - Knowledge graph context
   * @param modelName    - AI model that produced the claim
   * @param domain       - Knowledge domain
   * @returns Full ClaimAuditResult with verdict, confidence, and decision path
   */
  async classify(
    claim: string,
    graphContext: GraphContext,
    modelName: string,
    domain: string
  ): Promise<ClaimAuditResult> {
    const features = await this.extractFeatures(claim, graphContext, modelName, domain)

    if (!this.model) {
      // Cold start: use rule-based fallback
      return this.ruleBasedFallback(features, claim, domain)
    }

    const featureVec: FeatureVector = featuresToVector(features)
    const result = RandomForest.predict(this.model, featureVec)

    const verdict = result.predictedClass as ClaimVerdict
    const deltaScore = verdictToDeltaScore(verdict, result.confidence)

    // Find supporting / contradicting node ids from context
    const supportingEdge = graphContext.edges.find(
      e => e.relationship_type === 'SUPPORTS' &&
           (verdict === 'CONFIRMED' || verdict === 'SUPPORTED')
    )
    const contradictingNode = verdict === 'CONTRADICTED'
      ? graphContext.nodes.find(n =>
          graphContext.edges.some(
            e => e.relationship_type === 'CONTRADICTS' &&
                 (e.source_id === n.id || e.target_id === n.id)
          )
        )
      : undefined

    const explanation = buildExplanation(verdict, result, features)

    // Persist training example for continuous improvement
    await ModelStore.saveTrainingExample(
      MODEL_NAME,
      featureVec,
      verdict,
      'auto_confirmed',
      result.confidence
    ).catch(() => {/* non-blocking */})

    return {
      claim_text:             claim,
      verdict,
      confidence:             result.confidence,
      delta_score:            deltaScore,
      domain,
      supporting_edge_id:    supportingEdge?.id,
      contradicting_node_id: contradictingNode?.id,
      explanation,
    }
  }

  /**
   * Classify a batch of claims in parallel.
   *
   * @param claims       - Array of claim texts
   * @param graphContext - Shared graph context
   * @param modelName    - AI model name
   * @param domain       - Knowledge domain
   * @returns Array of ClaimAuditResult in same order as claims
   */
  async classifyBatch(
    claims: string[],
    graphContext: GraphContext,
    modelName: string,
    domain: string
  ): Promise<ClaimAuditResult[]> {
    return Promise.all(
      claims.map(c => this.classify(c, graphContext, modelName, domain))
    )
  }

  /**
   * Rule-based fallback used when no trained model is available.
   * Uses threshold rules on the same 10 features to produce a verdict.
   *
   * @param features - Extracted ClaimVerdictFeatures
   * @param claim    - Original claim text
   * @param domain   - Knowledge domain
   * @returns ClaimAuditResult derived from threshold rules
   */
  private ruleBasedFallback(
    features: ClaimVerdictFeatures,
    claim: string,
    domain: string
  ): ClaimAuditResult {
    let verdict: ClaimVerdict
    let confidence: number

    if (features.temporal_validity === 0.0 && features.embedding_similarity > 0.4) {
      verdict = 'OUTDATED'
      confidence = 0.7
    } else if (features.contradiction_count > 0.6) {
      verdict = 'CONTRADICTED'
      confidence = Math.min(0.9, 0.5 + features.contradiction_count * 0.4)
    } else if (features.speaker_match === 0 && features.source_confidence > 0.7 && features.embedding_similarity > 0.5) {
      verdict = 'MISATTRIBUTED'
      confidence = 0.6
    } else if (features.embedding_similarity > 0.6 && features.source_confidence > 0.7 && features.support_count > 0.4) {
      verdict = 'CONFIRMED'
      confidence = Math.min(0.95, features.source_confidence * features.embedding_similarity + features.support_count * 0.1)
    } else if (features.embedding_similarity > 0.3 && features.source_confidence > 0.4) {
      verdict = 'SUPPORTED'
      confidence = 0.5 + features.embedding_similarity * 0.2
    } else {
      verdict = 'UNVERIFIED'
      confidence = 0.5
    }

    const deltaScore = verdictToDeltaScore(verdict, confidence)

    return {
      claim_text:  claim,
      verdict,
      confidence,
      delta_score: deltaScore,
      domain,
      explanation: `[Rule-based fallback] ${verdict}: embedding_sim=${features.embedding_similarity.toFixed(2)}, `
        + `source_conf=${features.source_confidence.toFixed(2)}, `
        + `contradictions=${features.contradiction_count.toFixed(2)}, `
        + `temporal_validity=${features.temporal_validity}`,
    }
  }

  /**
   * Load the ClaimClassifier from Supabase.
   * Falls back to rule-based mode (null model) if no trained model exists.
   *
   * @returns Initialized ClaimClassifier instance
   */
  static async load(): Promise<ClaimClassifier> {
    try {
      const stored = await ModelStore.load(MODEL_NAME)
      if (stored && 'trees' in stored.model) {
        return new ClaimClassifier(stored.model as EnsembleModel)
      }
    } catch {
      // Supabase unavailable — cold start
    }
    return new ClaimClassifier(null)
  }

  /**
   * Train or retrain the model from accumulated examples.
   * Called by nightly retraining pipeline.
   *
   * @param minExamples - Minimum examples required (default 100)
   * @returns true if trained successfully, false if not enough data
   */
  static async trainFromExamples(minExamples = MIN_EXAMPLES_FOR_TRAINING): Promise<boolean> {
    const examples = await ModelStore.getTrainingExamples(MODEL_NAME)
    if (examples.length < minExamples) return false

    const model = RandomForest.train(examples, {
      nEstimators: 50,
      maxDepth: 8,
      minSamplesSplit: 5,
      maxFeatures: 'sqrt',
      criterion: 'gini',
      featureNames: [
        'embedding_similarity', 'source_confidence', 'source_age_days',
        'source_type_score', 'speaker_match', 'temporal_validity',
        'contradiction_count', 'support_count', 'causal_distance',
        'domain_hallucination_rate',
      ],
      classNames: VERDICT_CLASSES,
    })

    const version = `1.${examples.length}.0`
    await ModelStore.save(MODEL_NAME, model, {
      version,
      trainedAt: new Date().toISOString(),
      accuracy: 1 - (model.oobError ?? 0),
      featureNames: model.featureNames,
      classNames: VERDICT_CLASSES,
      modelType: 'random_forest',
      sampleCount: examples.length,
      notes: 'Auto-trained from accumulated claim audit results',
    })

    const usedIds = examples.map(e => e.id!).filter(Boolean)
    await ModelStore.markExamplesUsed(usedIds)

    return true
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function verdictToDeltaScore(verdict: ClaimVerdict, confidence: number): number {
  const baseScore: Record<ClaimVerdict, number> = {
    CONFIRMED:     0.0,
    SUPPORTED:     0.15,
    UNVERIFIED:    0.4,
    MISATTRIBUTED: 0.65,
    OUTDATED:      0.7,
    CONTRADICTED:  1.0,
  }
  const base = baseScore[verdict] ?? 0.5
  // Adjust by confidence: low confidence → pull toward 0.5
  return base * confidence + 0.5 * (1 - confidence)
}

function buildExplanation(
  verdict: ClaimVerdict,
  result: ReturnType<typeof RandomForest.predict>,
  features: ClaimVerdictFeatures
): string {
  const topFeatures = Object.entries(result.featureImportances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([f, imp]) => `${f}=${(features as FeatureVector)[f]?.toFixed(2) ?? '?'} (imp ${(imp * 100).toFixed(0)}%)`)
    .join(', ')

  return `[ML] ${verdict} (conf=${(result.confidence * 100).toFixed(0)}%) — `
    + `top features: ${topFeatures} — `
    + `trees agreed: ${result.treeConsensus}/${result.totalTrees}`
}
