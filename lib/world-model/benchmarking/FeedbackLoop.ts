/**
 * FeedbackLoop — Routing Weight & Demotion Orchestrator
 * Tech Genie / World Model Benchmarking Layer
 *
 * Consumes unprocessed benchmark results, computes per-model performance profiles,
 * and feeds the insights back into the routing layer by:
 *   1. Adjusting routing weights in `wm_model_routing_weights`
 *   2. Demoting or reinstating models based on score thresholds
 *   3. Writing routing training examples to ModelStore for continuous ML improvement
 *
 * Designed to run as a scheduled cron job (e.g. every 30 minutes).
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ModelStore } from '../ml/ModelStore'
import { ModelSelfBenchmark } from './ModelSelfBenchmark'
import type {
  BenchmarkResult,
  FeedbackLoopCycle,
  ModelPerformanceProfile,
  RoutingTrainingExample,
} from './types'

// ─────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────

interface BenchmarkResultRow {
  id: string
  created_at: string
  session_id: string
  model: string
  domain: string
  dimensions: BenchmarkResult['dimensions']
  composite_score: number
  latency_ms: number
  audit: BenchmarkResult['audit']
  routing_decision_id: string | null
  processed_by_feedback_loop: boolean
}

interface RoutingWeightRow {
  model: string
  domain: string
  routing_weight: number
  demoted: boolean
  demotion_reason: string | null
  updated_at: string
}

// ─────────────────────────────────────────────
// Domain numeric encoding
// ─────────────────────────────────────────────

/** Maps domain strings to numeric feature values for routing training examples. */
const DOMAIN_NUMERIC_MAP: Record<string, number> = {
  code:           0,
  reasoning:      1,
  research:       2,
  current_events: 3,
  strategy:       4,
  orchestration:  5,
  general:        6,
}

function encodeDomain(domain: string): number {
  return DOMAIN_NUMERIC_MAP[domain] ?? DOMAIN_NUMERIC_MAP['general']
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function rowToResult(row: BenchmarkResultRow): BenchmarkResult {
  return {
    id:                   row.id,
    created_at:           new Date(row.created_at),
    session_id:           row.session_id,
    model:                row.model,
    domain:               row.domain,
    dimensions:           row.dimensions,
    composite_score:      row.composite_score,
    latency_ms:           row.latency_ms,
    audit:                row.audit,
    routing_decision_id:  row.routing_decision_id ?? undefined,
  }
}

// ─────────────────────────────────────────────
// FeedbackLoop
// ─────────────────────────────────────────────

/**
 * Orchestrates the Model Self-Benchmarking Feedback Loop.
 *
 * Runs in discrete cycles: each cycle processes all pending benchmark results,
 * computes updated model profiles, adjusts routing weights, and writes ML training
 * examples back to ModelStore so the routing decision tree can be retrained.
 */
export class FeedbackLoop {
  // ── Demotion thresholds ───────────────────────────────────────────────────
  private static readonly DEMOTION_THRESHOLD         = 0.35
  private static readonly REINSTATE_THRESHOLD        = 0.55
  private static readonly MIN_BENCHMARKS_FOR_DEMOTION = 10

  // ── Routing weight bounds ─────────────────────────────────────────────────
  private static readonly ROUTING_WEIGHT_FLOOR   = 0.1
  private static readonly ROUTING_WEIGHT_CEILING = 2.0

  private readonly supabase:  SupabaseClient
  private readonly store:     ModelStore
  private readonly benchmark: ModelSelfBenchmark

  /**
   * Construct a FeedbackLoop instance.
   *
   * @param supabase   - Initialized Supabase client (service role recommended)
   * @param modelStore - ModelStore instance for writing routing training examples
   */
  constructor(supabase: SupabaseClient, modelStore: ModelStore) {
    this.supabase  = supabase
    this.store     = modelStore
    this.benchmark = new ModelSelfBenchmark(supabase)
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Execute one full feedback cycle.
   *
   * Steps:
   * 1. Fetch all unprocessed benchmark results (processed_by_feedback_loop = false)
   * 2. For each unique model × domain:
   *    a. Compute performance profile (rolling 30d)
   *    b. Check demotion / reinstatement
   *    c. Upsert routing weight in wm_model_routing_weights
   *    d. Convert results to routing training examples and write to ModelStore
   * 3. Mark all processed benchmarks as done
   * 4. Return cycle summary
   *
   * @returns FeedbackLoopCycle summary describing all actions taken
   */
  async runCycle(): Promise<FeedbackLoopCycle> {
    const ranAt = new Date()

    const modelsDemoted:    string[] = []
    const modelsReinstated: string[] = []
    let profilesUpdated             = 0
    let trainingExamplesWritten     = 0
    let routingWeightsAdjusted      = 0

    // ── Step 1: fetch unprocessed benchmarks ──────────────────────────────────
    let unprocessedResults: BenchmarkResult[] = []
    let processedIds: string[] = []

    try {
      const { data, error } = await this.supabase
        .from('wm_benchmark_results')
        .select('*')
        .eq('processed_by_feedback_loop', false)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[FeedbackLoop] Failed to fetch unprocessed benchmarks:', error.message)
      } else {
        const rows = (data ?? []) as BenchmarkResultRow[]
        unprocessedResults = rows.map(rowToResult)
        processedIds = rows.map(r => r.id)
      }
    } catch (err) {
      console.error('[FeedbackLoop] Supabase unavailable during runCycle fetch:', err)
    }

    if (unprocessedResults.length === 0) {
      return {
        ran_at:                    ranAt,
        benchmarks_processed:      0,
        profiles_updated:          0,
        training_examples_written: 0,
        models_demoted:            [],
        models_reinstated:         [],
        routing_weights_adjusted:  0,
      }
    }

    // ── Step 2: group by model × domain ──────────────────────────────────────
    const groupMap = new Map<string, BenchmarkResult[]>()
    for (const result of unprocessedResults) {
      const key = `${result.model}:::${result.domain}`
      const group = groupMap.get(key) ?? []
      group.push(result)
      groupMap.set(key, group)
    }

    // ── Step 3: process each model × domain group ─────────────────────────────
    for (const [key, groupResults] of groupMap) {
      const [model, domain] = key.split(':::')

      // 3a. Get performance profile
      const profile = await this.benchmark.getModelProfile(model, domain)
      if (profile === null) {
        // Not enough data yet; still write training examples
        for (const r of groupResults) {
          await this.writeTrainingExample(r)
          trainingExamplesWritten++
        }
        continue
      }

      profilesUpdated++

      // 3b. Fetch current routing weight row for demoted state
      const currentWeight = await this.fetchRoutingWeight(model, domain)
      const profileWithCurrentState: ModelPerformanceProfile = {
        ...profile,
        demoted:        currentWeight?.demoted ?? false,
        demotion_reason: currentWeight?.demotion_reason ?? undefined,
        routing_weight: currentWeight?.routing_weight ?? 1.0,
      }

      // 3c. Demotion check
      const demotionOutcome = this.checkDemotion(profileWithCurrentState)
      const finalDemoted = demotionOutcome.demoted

      if (!profileWithCurrentState.demoted && finalDemoted) {
        modelsDemoted.push(`${model}:${domain}`)
      } else if (profileWithCurrentState.demoted && !finalDemoted) {
        modelsReinstated.push(`${model}:${domain}`)
      }

      // 3d. Compute routing weight
      const demotedProfile: ModelPerformanceProfile = {
        ...profileWithCurrentState,
        demoted:        finalDemoted,
        demotion_reason: demotionOutcome.reason,
      }
      const routingWeight = this.computeRoutingWeight(demotedProfile)

      // 3e. Upsert routing weight row
      const upserted = await this.upsertRoutingWeight(
        model,
        domain,
        routingWeight,
        finalDemoted,
        demotionOutcome.reason
      )
      if (upserted) routingWeightsAdjusted++

      // 3f. Write routing training examples
      for (const r of groupResults) {
        await this.writeTrainingExample(r)
        trainingExamplesWritten++
      }
    }

    // ── Step 4: mark benchmarks as processed ──────────────────────────────────
    if (processedIds.length > 0) {
      try {
        const { error } = await this.supabase
          .from('wm_benchmark_results')
          .update({ processed_by_feedback_loop: true })
          .in('id', processedIds)

        if (error) {
          console.error('[FeedbackLoop] Failed to mark benchmarks as processed:', error.message)
        }
      } catch (err) {
        console.error('[FeedbackLoop] Supabase unavailable when marking processed:', err)
      }
    }

    return {
      ran_at:                    ranAt,
      benchmarks_processed:      unprocessedResults.length,
      profiles_updated:          profilesUpdated,
      training_examples_written: trainingExamplesWritten,
      models_demoted:            modelsDemoted,
      models_reinstated:         modelsReinstated,
      routing_weights_adjusted:  routingWeightsAdjusted,
    }
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Evaluate whether a model should be demoted or reinstated based on its profile.
   *
   * Demotion conditions (evaluated in priority order):
   * - Too few benchmarks → no change
   * - avg_composite_score < 0.35 AND trend is 'degrading' → demote
   * - hallucination_rate > 40% → demote
   * - Currently demoted AND score recovered above 0.55 AND trend not degrading → reinstate
   *
   * @param profile - Current performance profile including existing demoted state
   * @returns Object with new demoted flag and optional reason string
   */
  private checkDemotion(
    profile: ModelPerformanceProfile
  ): { demoted: boolean; reason?: string } {
    if (profile.total_benchmarks < FeedbackLoop.MIN_BENCHMARKS_FOR_DEMOTION) {
      // Not enough data — preserve current state
      return { demoted: profile.demoted, reason: profile.demotion_reason }
    }

    // Condition 1: low score with degrading trend
    if (
      profile.avg_composite_score < FeedbackLoop.DEMOTION_THRESHOLD &&
      profile.confidence_trend === 'degrading'
    ) {
      return {
        demoted: true,
        reason: `Composite score ${profile.avg_composite_score.toFixed(2)} below threshold with degrading trend`,
      }
    }

    // Condition 2: excessive hallucination
    if (profile.hallucination_rate > 0.4) {
      return {
        demoted: true,
        reason: `Hallucination rate ${(profile.hallucination_rate * 100).toFixed(0)}% exceeds 40% threshold`,
      }
    }

    // Condition 3: reinstatement
    if (
      profile.demoted &&
      profile.avg_composite_score > FeedbackLoop.REINSTATE_THRESHOLD &&
      profile.confidence_trend !== 'degrading'
    ) {
      return { demoted: false }
    }

    // No change
    return { demoted: profile.demoted, reason: profile.demotion_reason }
  }

  /**
   * Compute the routing weight multiplier for a model in a domain.
   *
   * Formula:
   *   weight = clamp(composite_score / 0.7, FLOOR, CEILING)
   *   If demoted → weight = FLOOR regardless
   *
   * A model scoring exactly 0.7 (the "expected" baseline) will have weight = 1.0.
   * Better models get weight > 1.0 (up to 2.0); worse models get weight < 1.0.
   *
   * @param profile - Performance profile including demoted flag
   * @returns Routing weight in [ROUTING_WEIGHT_FLOOR, ROUTING_WEIGHT_CEILING]
   */
  private computeRoutingWeight(profile: ModelPerformanceProfile): number {
    if (profile.demoted) {
      return FeedbackLoop.ROUTING_WEIGHT_FLOOR
    }

    const raw = profile.avg_composite_score / 0.7
    return Math.max(
      FeedbackLoop.ROUTING_WEIGHT_FLOOR,
      Math.min(FeedbackLoop.ROUTING_WEIGHT_CEILING, raw)
    )
  }

  /**
   * Convert a BenchmarkResult into a RoutingTrainingExample for ModelStore.
   *
   * Maps available benchmark fields to the 10-element RoutingFeatures vector:
   * [domain_code, query_complexity, requires_recency, requires_reasoning,
   *  requires_code, truth_score_gemini, truth_score_claude, truth_score_deepseek,
   *  context_size_normalized, user_tier]
   *
   * Fields not derivable from a benchmark result default to neutral values.
   *
   * @param result - BenchmarkResult to convert
   * @returns RoutingTrainingExample ready for ModelStore.saveTrainingExample()
   */
  private convertToTrainingExample(result: BenchmarkResult): RoutingTrainingExample {
    const domainCode = encodeDomain(result.domain)
    const model = result.model.toLowerCase()

    // Map composite score to per-model truth scores — the model that ran scores
    // at its actual composite; others get a neutral prior of 0.7
    const truth_score_gemini    = model.includes('gemini')   ? result.composite_score : 0.7
    const truth_score_claude    = model.includes('claude')   ? result.composite_score : 0.7
    const truth_score_deepseek  = model.includes('deepseek') ? result.composite_score : 0.7

    // Use claim_quality_score as a proxy for query complexity
    const query_complexity = result.dimensions.claim_quality_score

    // code domain implies requires_code; no direct signal for recency/reasoning
    const requires_code = result.domain === 'code' ? 1 : 0

    const features: number[] = [
      domainCode,               // domain_code
      query_complexity,         // query_complexity (proxy)
      0,                        // requires_recency (unavailable)
      0,                        // requires_reasoning (unavailable)
      requires_code,            // requires_code
      truth_score_gemini,       // truth_score_gemini
      truth_score_claude,       // truth_score_claude
      truth_score_deepseek,     // truth_score_deepseek
      0,                        // context_size_normalized (unavailable)
      0,                        // user_tier (unavailable)
    ]

    return {
      features,
      label:         result.model,
      outcome_score: result.composite_score,
      domain:        result.domain,
      timestamp:     result.created_at,
    }
  }

  /**
   * Fetch the current routing weight row for a model × domain from Supabase.
   * Returns null if no row exists or on error.
   */
  private async fetchRoutingWeight(
    model: string,
    domain: string
  ): Promise<RoutingWeightRow | null> {
    try {
      const { data, error } = await this.supabase
        .from('wm_model_routing_weights')
        .select('*')
        .eq('model', model)
        .eq('domain', domain)
        .single()

      if (error || !data) return null
      return data as RoutingWeightRow
    } catch {
      return null
    }
  }

  /**
   * Upsert a routing weight row in wm_model_routing_weights.
   * Returns true on success, false on error.
   */
  private async upsertRoutingWeight(
    model: string,
    domain: string,
    routingWeight: number,
    demoted: boolean,
    demotionReason?: string
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('wm_model_routing_weights')
        .upsert(
          {
            model,
            domain,
            routing_weight:  routingWeight,
            demoted,
            demotion_reason: demotionReason ?? null,
            updated_at:      new Date().toISOString(),
          },
          { onConflict: 'model,domain' }
        )

      if (error) {
        console.error('[FeedbackLoop] Failed to upsert routing weight:', error.message)
        return false
      }
      return true
    } catch (err) {
      console.error('[FeedbackLoop] Supabase unavailable during upsertRoutingWeight:', err)
      return false
    }
  }

  /**
   * Convert a BenchmarkResult to a training example and persist it via ModelStore.
   */
  private async writeTrainingExample(result: BenchmarkResult): Promise<void> {
    const example = this.convertToTrainingExample(result)

    // Build a FeatureVector (named map) from the numeric array, using
    // the same key order as RoutingModel's featureNames
    const featureNames = [
      'domain_code', 'query_complexity', 'requires_recency', 'requires_reasoning',
      'requires_code', 'truth_score_gemini', 'truth_score_claude', 'truth_score_deepseek',
      'context_size_normalized', 'user_tier',
    ]

    const featureVector: Record<string, number> = {}
    for (let i = 0; i < featureNames.length; i++) {
      featureVector[featureNames[i]] = example.features[i] ?? 0
    }

    await ModelStore.saveTrainingExample(
      'routing_model',
      featureVector,
      example.label,
      'auto_confirmed',
      example.outcome_score
    )
  }
}
