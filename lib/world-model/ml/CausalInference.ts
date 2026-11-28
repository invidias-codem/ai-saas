/**
 * CausalInference — ML-Based Causal Strength Inference
 * Tech Genie / World Model ML Layer
 *
 * Infers causal edge strength and relationship type between knowledge graph nodes
 * using a Random Forest trained on 7 graph-structural features.
 *
 * Enables:
 *   - Automatically weighting new causal edges based on evidence
 *   - Discovering implicit causal chains across the graph
 *   - Building causal chains for simulation inputs
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import { RandomForest } from './RandomForest'
import { ModelStore } from './ModelStore'
import type {
  EnsembleModel,
  CausalStrengthFeatures,
  FeatureVector,
} from './types'
import type {
  RelationshipType,
  TemporalKnowledgeNode,
  CausalEdge,
} from '../types'
import type { GraphContext } from './ClaimClassifier'

/** Model name for Supabase persistence */
const MODEL_NAME = 'causal_inference'

/** Minimum examples before ML model replaces heuristic */
const MIN_EXAMPLES = 100

/** Causal strength output classes (discretized for classification) */
const STRENGTH_CLASSES = ['very_weak', 'weak', 'moderate', 'strong', 'very_strong'] as const
type StrengthClass = typeof STRENGTH_CLASSES[number]

/** Map strength class → numeric value */
const STRENGTH_TO_NUMERIC: Record<StrengthClass, number> = {
  very_weak:  0.1,
  weak:       0.3,
  moderate:   0.5,
  strong:     0.75,
  very_strong: 0.95,
}

/** Relationship types for classification (ordered) */
const RELATIONSHIP_CLASSES: RelationshipType[] = [
  'CAUSES',
  'CORRELATES_WITH',
  'PRECEDES',
  'SUPPORTS',
  'CONTRADICTS',
  'INHIBITS',
  'RELATES_TO',
]

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Count how many times two node ids appear in "co-occurrence" by sharing edges
 * with a common neighbor.
 */
function coOccurrenceCount(
  sourceId: string,
  targetId: string,
  edges: CausalEdge[]
): number {
  // Neighbors of source
  const sourceNeighbors = new Set<string>()
  for (const e of edges) {
    if (e.source_id === sourceId) sourceNeighbors.add(e.target_id)
    if (e.target_id === sourceId) sourceNeighbors.add(e.source_id)
  }

  // Count how many of target's neighbors also appear in source's neighbors
  let count = 0
  for (const e of edges) {
    if (e.source_id === targetId && sourceNeighbors.has(e.target_id)) count++
    if (e.target_id === targetId && sourceNeighbors.has(e.source_id)) count++
  }

  return count
}

/**
 * Infer domain match between two nodes from their canonical names and content.
 * Returns 1.0 (same domain), 0.5 (related), 0.0 (different).
 */
function domainMatch(source: TemporalKnowledgeNode, target: TemporalKnowledgeNode): number {
  // Use entity type as a proxy for domain
  if (source.type === target.type) return 1.0

  // Related type pairs
  const relatedPairs = new Set([
    'person:organization', 'organization:person',
    'event:claim',         'claim:event',
    'product:metric',      'metric:product',
    'concept:document',    'document:concept',
  ])
  const pair = `${source.type}:${target.type}`
  return relatedPairs.has(pair) ? 0.5 : 0.0
}

/**
 * Estimate base rate of a relationship type in the graph.
 */
function baseRate(relationshipType: RelationshipType, edges: CausalEdge[]): number {
  if (edges.length === 0) return 0.1
  const count = edges.filter(e => e.relationship_type === relationshipType).length
  return Math.min(1, count / edges.length)
}

/**
 * Check whether an intervention (explicit human action) is detectable
 * between source and target. Heuristic: look for 'user'-sourced nodes
 * with valid_from between the two events.
 */
function interventionPresent(
  source: TemporalKnowledgeNode,
  target: TemporalKnowledgeNode,
  nodes: TemporalKnowledgeNode[]
): number {
  const from = new Date(source.valid_from).getTime()
  const to   = new Date(target.valid_from).getTime()
  const [start, end] = from < to ? [from, to] : [to, from]

  const intervention = nodes.find(n => {
    const t = new Date(n.valid_from).getTime()
    return n.source_type === 'user' && t >= start && t <= end
  })

  return intervention ? 1 : 0
}

/**
 * Count edges that explicitly CONTRADICT the causal relationship.
 */
function contradictionCount(
  sourceId: string,
  targetId: string,
  edges: CausalEdge[]
): number {
  const count = edges.filter(
    e => e.relationship_type === 'CONTRADICTS' &&
         ((e.source_id === sourceId && e.target_id === targetId) ||
          (e.source_id === targetId && e.target_id === sourceId))
  ).length
  return Math.min(1, count / 3)
}

function featuresToVector(f: CausalStrengthFeatures): FeatureVector {
  return {
    temporal_gap_hours:    f.temporal_gap_hours,
    co_occurrence_count:   f.co_occurrence_count,
    domain_match:          f.domain_match,
    prior_causal_strength: f.prior_causal_strength,
    intervention_present:  f.intervention_present,
    contradiction_count:   f.contradiction_count,
    base_rate:             f.base_rate,
  }
}

// ─────────────────────────────────────────────
// CausalInference
// ─────────────────────────────────────────────

/**
 * ML-based causal strength inference for the knowledge graph.
 *
 * Usage:
 *   const ci = await CausalInference.load()
 *   const strength = await ci.inferStrength(sourceNode, targetNode, context)
 */
export class CausalInference {
  private model: EnsembleModel | null

  constructor(model: EnsembleModel | null) {
    this.model = model
  }

  /**
   * Infer the causal strength (0.0–1.0) between two knowledge graph nodes.
   *
   * @param source  - Source knowledge node
   * @param target  - Target knowledge node
   * @param context - Graph context (all nodes and edges)
   * @returns Numeric causal strength [0.0, 1.0]
   */
  async inferStrength(
    source: TemporalKnowledgeNode,
    target: TemporalKnowledgeNode,
    context: GraphContext
  ): Promise<number> {
    const features = this.extractFeatures(source, target, context)

    if (!this.model) {
      return this.heuristicStrength(features)
    }

    const featureVec = featuresToVector(features)
    const result = RandomForest.predict(this.model, featureVec)
    const strengthClass = result.predictedClass as StrengthClass

    const numeric = STRENGTH_TO_NUMERIC[strengthClass] ?? 0.5

    // Blend with confidence: low confidence → pull toward 0.5
    return numeric * result.confidence + 0.5 * (1 - result.confidence)
  }

  /**
   * Infer the most likely relationship type between two nodes.
   *
   * @param source  - Source knowledge node
   * @param target  - Target knowledge node
   * @param context - Graph context
   * @returns Predicted RelationshipType
   */
  async inferRelationshipType(
    source: TemporalKnowledgeNode,
    target: TemporalKnowledgeNode,
    context: GraphContext
  ): Promise<RelationshipType> {
    const features = this.extractFeatures(source, target, context)

    if (!this.model) {
      return this.heuristicRelationshipType(features, source, target, context.edges)
    }

    // Use a second model pass or the same model with different class names
    // For simplicity: use features to pick type heuristically when model isn't specialized
    return this.heuristicRelationshipType(features, source, target, context.edges)
  }

  /**
   * Build a causal chain from a given entity outward in the graph.
   * Returns edges sorted by causal strength descending.
   *
   * @param entityId - Starting entity id
   * @param context  - Graph context
   * @param maxDepth - Maximum BFS depth (default 3)
   * @returns Array of causal edges in the chain
   */
  async buildCausalChain(
    entityId: string,
    context: GraphContext,
    maxDepth = 3
  ): Promise<CausalEdge[]> {
    // Prefer the DB-owned traversal (get_causal_chain RPC) — Postgres handles
    // cycle-pruning and temporal validity. Fall back to the in-memory BFS when
    // the RPC is unavailable (e.g. offline / tests).
    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const { data, error } = await supabase.rpc('get_causal_chain', {
        p_root_node_id: entityId,
        p_max_depth: maxDepth,
        p_min_causal_strength: 0.0,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map((row: any) => ({
          id: row.id ?? `${row.source_node_id}:${row.target_node_id}`,
          source_id: row.source_node_id,
          target_id: row.target_node_id,
          relationship_type: row.relationship_type,
          valid_from: new Date(row.valid_from ?? Date.now()),
          valid_until: row.valid_until ? new Date(row.valid_until) : undefined,
          confidence: row.confidence ?? 1.0,
          causal_strength: row.causal_strength,
          created_at: new Date(),
        } as CausalEdge));
      }
    } catch (err) {
      console.warn('[CausalInference] get_causal_chain RPC unavailable, falling back to in-memory BFS:', err);
    }

    // In-memory BFS fallback
    const { nodes, edges } = context
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    const visited = new Set<string>([entityId])
    const queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }]
    const chain: CausalEdge[] = []

    while (queue.length > 0) {
      const curr = queue.shift()!
      if (curr.depth >= maxDepth) continue

      const outgoing = edges.filter(
        e => e.source_id === curr.id &&
             (e.relationship_type === 'CAUSES' ||
              e.relationship_type === 'PRECEDES' ||
              e.relationship_type === 'SUPPORTS' ||
              e.relationship_type === 'ENABLES' ||
              e.relationship_type === 'REQUIRES')
      )

      for (const edge of outgoing) {
        const targetNode = nodeMap.get(edge.target_id)
        const sourceNode = nodeMap.get(edge.source_id)

        if (!targetNode || !sourceNode) continue

        const strength = await this.inferStrength(sourceNode, targetNode, context)
        const enrichedEdge: CausalEdge = {
          ...edge,
          causal_strength: edge.causal_strength ?? strength,
        }
        chain.push(enrichedEdge)

        if (!visited.has(edge.target_id)) {
          visited.add(edge.target_id)
          queue.push({ id: edge.target_id, depth: curr.depth + 1 })
        }
      }
    }

    return chain.sort((a, b) => (b.causal_strength ?? 0) - (a.causal_strength ?? 0))
  }

  /**
   * Extract the 7 causal strength features for a source→target pair.
   *
   * @param source  - Source node
   * @param target  - Target node
   * @param context - Graph context
   * @returns CausalStrengthFeatures
   */
  private extractFeatures(
    source: TemporalKnowledgeNode,
    target: TemporalKnowledgeNode,
    context: GraphContext
  ): CausalStrengthFeatures {
    const { nodes, edges } = context

    // Feature 1: temporal_gap_hours (normalized, capped at 720h)
    const fromTime = new Date(source.valid_from).getTime()
    const toTime   = new Date(target.valid_from).getTime()
    const gapHours = Math.abs(toTime - fromTime) / (1000 * 60 * 60)
    const temporalGapHours = Math.min(1, gapHours / 720)

    // Feature 2: co_occurrence_count (normalized, capped at 10)
    const coOcc = coOccurrenceCount(source.id, target.id, edges)
    const coOccurrenceCountNorm = Math.min(1, coOcc / 10)

    // Feature 3: domain_match
    const domainMatchVal = domainMatch(source, target)

    // Feature 4: prior_causal_strength
    const existingEdge = edges.find(
      e => e.source_id === source.id &&
           e.target_id === target.id &&
           (e.relationship_type === 'CAUSES' || e.relationship_type === 'PRECEDES')
    )
    const priorCausalStrength = existingEdge?.causal_strength ?? 0

    // Feature 5: intervention_present
    const interventionPresentVal = interventionPresent(source, target, nodes)

    // Feature 6: contradiction_count
    const contradictionCountVal = contradictionCount(source.id, target.id, edges)

    // Feature 7: base_rate (for CAUSES relationship)
    const baseRateVal = baseRate('CAUSES', edges)

    return {
      temporal_gap_hours:    temporalGapHours,
      co_occurrence_count:   coOccurrenceCountNorm,
      domain_match:          domainMatchVal,
      prior_causal_strength: priorCausalStrength,
      intervention_present:  interventionPresentVal,
      contradiction_count:   contradictionCountVal,
      base_rate:             baseRateVal,
    }
  }

  /** Heuristic fallback for causal strength when no model is available */
  private heuristicStrength(features: CausalStrengthFeatures): number {
    const score =
      features.prior_causal_strength * 0.4 +
      features.co_occurrence_count    * 0.2 +
      features.domain_match           * 0.15 +
      features.intervention_present   * 0.1 +
      features.base_rate              * 0.1 -
      features.contradiction_count    * 0.3 -
      features.temporal_gap_hours     * 0.1

    return Math.min(1, Math.max(0, score + 0.3))
  }

  /** Heuristic fallback for relationship type */
  private heuristicRelationshipType(
    features: CausalStrengthFeatures,
    source: TemporalKnowledgeNode,
    target: TemporalKnowledgeNode,
    edges: CausalEdge[]
  ): RelationshipType {
    if (features.contradiction_count > 0.5) return 'CONTRADICTS'
    if (features.prior_causal_strength > 0.6) {
      return features.temporal_gap_hours < 0.1 ? 'CAUSES' : 'PRECEDES'
    }
    if (features.co_occurrence_count > 0.5) return 'CORRELATES_WITH'
    if (features.temporal_gap_hours < 0.2) return 'CAUSES'
    if (source.type === 'claim' || target.type === 'claim') return 'SUPPORTS'
    return 'RELATES_TO'
  }

  /**
   * Load the CausalInference model from Supabase.
   * Falls back to heuristic mode if no model exists.
   *
   * @returns Initialized CausalInference instance
   */
  static async load(): Promise<CausalInference> {
    try {
      const stored = await ModelStore.load(MODEL_NAME)
      if (stored && 'trees' in stored.model) {
        return new CausalInference(stored.model as EnsembleModel)
      }
    } catch {
      // Supabase unavailable
    }
    return new CausalInference(null)
  }

  /**
   * Train the causal inference model from accumulated examples.
   *
   * @param minExamples - Minimum examples required
   * @returns true if training succeeded
   */
  static async trainFromExamples(minExamples = MIN_EXAMPLES): Promise<boolean> {
    const examples = await ModelStore.getTrainingExamples(MODEL_NAME)
    if (examples.length < minExamples) return false

    const model = RandomForest.train(examples, {
      nEstimators: 40,
      maxDepth: 6,
      minSamplesSplit: 4,
      maxFeatures: 'sqrt',
      criterion: 'gini',
      featureNames: [
        'temporal_gap_hours', 'co_occurrence_count', 'domain_match',
        'prior_causal_strength', 'intervention_present',
        'contradiction_count', 'base_rate',
      ],
      classNames: [...STRENGTH_CLASSES],
    })

    await ModelStore.save(MODEL_NAME, model, {
      version: `1.${examples.length}.0`,
      trainedAt: new Date().toISOString(),
      accuracy: 1 - (model.oobError ?? 0),
      featureNames: model.featureNames,
      classNames: [...STRENGTH_CLASSES],
      modelType: 'random_forest',
      sampleCount: examples.length,
      notes: 'Auto-trained for causal strength inference',
    })

    await ModelStore.markExamplesUsed(examples.map(e => e.id!).filter(Boolean))
    return true
  }
}
