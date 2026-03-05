/**
 * ModelSelfBenchmark — Per-Response Scoring Engine
 * Tech Genie / World Model Benchmarking Layer
 *
 * Scores each AI model response along 4 dimensions:
 *   1. Accuracy       — inversely proportional to delta_score from Delta Engine
 *   2. Claim Quality  — fraction of CONFIRMED + SUPPORTED claims
 *   3. Graph Utilization — fraction of claims backed by a graph edge
 *   4. Latency        — normalized against per-model p95 baseline
 *
 * Persists results to `wm_benchmark_results` for the FeedbackLoop to consume.
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIOutputAudit } from '../types'
import type { BenchmarkDimensions, BenchmarkResult, ModelPerformanceProfile } from './types'

// ─────────────────────────────────────────────
// Row type matching wm_benchmark_results schema
// ─────────────────────────────────────────────

interface BenchmarkResultRow {
  id: string
  created_at: string
  session_id: string
  model: string
  domain: string
  dimensions: BenchmarkDimensions
  composite_score: number
  latency_ms: number
  audit: AIOutputAudit
  routing_decision_id: string | null
  processed_by_feedback_loop: boolean
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Map a database row to the typed BenchmarkResult */
function rowToResult(row: BenchmarkResultRow): BenchmarkResult {
  return {
    id: row.id,
    created_at: new Date(row.created_at),
    session_id: row.session_id,
    model: row.model,
    domain: row.domain,
    dimensions: row.dimensions,
    composite_score: row.composite_score,
    latency_ms: row.latency_ms,
    audit: row.audit,
    routing_decision_id: row.routing_decision_id ?? undefined,
  }
}

/** Arithmetic mean of an array of numbers. Returns 0 for empty arrays. */
function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Compute the p95 value from a numeric array. Sorts in place. */
function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  return sorted[Math.min(idx, sorted.length - 1)]
}

// ─────────────────────────────────────────────
// ModelSelfBenchmark
// ─────────────────────────────────────────────

/**
 * Scores AI model responses and maintains rolling performance profiles.
 *
 * All reads from and writes to Supabase are wrapped in try/catch so that
 * a database outage never propagates as an uncaught error.
 */
export class ModelSelfBenchmark {
  // ── Scoring weights ──────────────────────────────────────────────────────
  private static readonly ACCURACY_WEIGHT      = 0.4
  private static readonly CLAIM_QUALITY_WEIGHT = 0.3
  private static readonly GRAPH_UTIL_WEIGHT    = 0.2
  private static readonly LATENCY_WEIGHT       = 0.1

  /**
   * Default p95 latency baselines (ms) per model family.
   * Matched via partial (case-insensitive) model name lookup.
   */
  private static readonly P95_LATENCY_BASELINES: Record<string, number> = {
    'gemini-flash': 300,
    'gemini':       600,
    'claude':      1200,
    'deepseek':     800,
    'default':      800,
  }

  private readonly supabase: SupabaseClient

  /**
   * Construct a new ModelSelfBenchmark instance.
   *
   * @param supabase - Initialized Supabase client (service role recommended)
   */
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  /**
   * Score a single AI model response along 4 dimensions and persist the result.
   *
   * Dimension computation:
   * - `accuracy_score`          = 1.0 − audit.overall_delta_score
   * - `claim_quality_score`     = % of CONFIRMED + SUPPORTED claims (0.5 if no claims)
   * - `graph_utilization_score` = % of claims with a supporting_edge_id (0.3 if no claims)
   * - `latency_score`           = max(0, 1.0 − latencyMs / (p95_baseline × 2))
   * - `composite_score`         = weighted sum of the four dimensions
   *
   * @param params.sessionId        - Conversation session identifier
   * @param params.model            - AI model name (e.g. 'gemini-flash')
   * @param params.domain           - Domain classification (e.g. 'code', 'reasoning')
   * @param params.audit            - Full AIOutputAudit from the Delta Engine
   * @param params.latencyMs        - Observed response latency in milliseconds
   * @param params.routingDecisionId - Optional RoutingDecision.id that selected this model
   * @returns The persisted BenchmarkResult
   */
  async scoreResponse(params: {
    sessionId: string
    model: string
    domain: string
    audit: AIOutputAudit
    latencyMs: number
    routingDecisionId?: string
  }): Promise<BenchmarkResult> {
    const { sessionId, model, domain, audit, latencyMs, routingDecisionId } = params

    // ── 1. Accuracy ─────────────────────────────────────────────────────────
    const accuracy_score = Math.max(0, Math.min(1, 1.0 - audit.overall_delta_score))

    // ── 2. Claim quality ────────────────────────────────────────────────────
    const totalClaims = audit.claims.length
    let claim_quality_score: number
    if (totalClaims === 0) {
      claim_quality_score = 0.5 // Neutral — we don't penalize empty responses
    } else {
      const goodClaims = audit.claims.filter(
        c => c.verdict === 'CONFIRMED' || c.verdict === 'SUPPORTED'
      ).length
      claim_quality_score = goodClaims / totalClaims
    }

    // ── 3. Graph utilization ─────────────────────────────────────────────────
    let graph_utilization_score: number
    if (totalClaims === 0) {
      graph_utilization_score = 0.3 // Low utilization — model didn't use graph
    } else {
      const graphBacked = audit.claims.filter(c => !!c.supporting_edge_id).length
      graph_utilization_score = graphBacked / totalClaims
    }

    // ── 4. Latency ───────────────────────────────────────────────────────────
    const baseline = this.getLatencyBaseline(model)
    const latency_score = Math.max(0, 1.0 - latencyMs / (baseline * 2))

    // ── 5. Composite ─────────────────────────────────────────────────────────
    const dimensions: BenchmarkDimensions = {
      accuracy_score,
      claim_quality_score,
      graph_utilization_score,
      latency_score,
    }

    const composite_score =
      ModelSelfBenchmark.ACCURACY_WEIGHT      * accuracy_score +
      ModelSelfBenchmark.CLAIM_QUALITY_WEIGHT * claim_quality_score +
      ModelSelfBenchmark.GRAPH_UTIL_WEIGHT    * graph_utilization_score +
      ModelSelfBenchmark.LATENCY_WEIGHT       * latency_score

    // ── 6. Persist ───────────────────────────────────────────────────────────
    const insertPayload = {
      session_id:                sessionId,
      model,
      domain,
      dimensions,
      composite_score,
      latency_ms:                latencyMs,
      audit,
      routing_decision_id:       routingDecisionId ?? null,
      processed_by_feedback_loop: false,
    }

    try {
      const { data, error } = await this.supabase
        .from('wm_benchmark_results')
        .insert(insertPayload)
        .select()
        .single()

      if (error) {
        console.error('[ModelSelfBenchmark] Failed to persist benchmark result:', error.message)
        // Return an in-memory result with a synthetic id so callers can still use it
        return {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date(),
          session_id: sessionId,
          model,
          domain,
          dimensions,
          composite_score,
          latency_ms: latencyMs,
          audit,
          routing_decision_id: routingDecisionId,
        }
      }

      return rowToResult(data as BenchmarkResultRow)
    } catch (err) {
      console.error('[ModelSelfBenchmark] Supabase unavailable during scoreResponse:', err)
      return {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date(),
        session_id: sessionId,
        model,
        domain,
        dimensions,
        composite_score,
        latency_ms: latencyMs,
        audit,
        routing_decision_id: routingDecisionId,
      }
    }
  }

  /**
   * Compute the rolling 30-day performance profile for a model × domain pair.
   *
   * Aggregates all benchmark results in the window, computes dimension averages,
   * p95 latency, hallucination rate, and a confidence trend (last-7d vs last-30d).
   *
   * Returns null if fewer than 5 benchmarks exist in the window.
   * This method is read-only; it does not write to any Supabase table.
   *
   * @param model  - AI model name
   * @param domain - Domain classification
   * @returns Aggregated ModelPerformanceProfile or null if insufficient data
   */
  async getModelProfile(model: string, domain: string): Promise<ModelPerformanceProfile | null> {
    const now = new Date()
    const window30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const window7Start  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)

    try {
      const { data, error } = await this.supabase
        .from('wm_benchmark_results')
        .select('*')
        .eq('model', model)
        .eq('domain', domain)
        .gte('created_at', window30Start.toISOString())
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[ModelSelfBenchmark] getModelProfile query failed:', error.message)
        return null
      }

      const rows = (data ?? []) as BenchmarkResultRow[]

      if (rows.length < 5) {
        return null
      }

      const results = rows.map(rowToResult)

      // ── Aggregate metrics ──────────────────────────────────────────────────
      const composite_scores           = results.map(r => r.composite_score)
      const accuracy_scores            = results.map(r => r.dimensions.accuracy_score)
      const claim_quality_scores       = results.map(r => r.dimensions.claim_quality_score)
      const graph_utilization_scores   = results.map(r => r.dimensions.graph_utilization_score)
      const latency_values             = results.map(r => r.latency_ms)

      const avg_composite_score          = avg(composite_scores)
      const avg_accuracy_score           = avg(accuracy_scores)
      const avg_claim_quality_score      = avg(claim_quality_scores)
      const avg_graph_utilization_score  = avg(graph_utilization_scores)
      const avg_latency_ms               = avg(latency_values)
      const p95_latency_ms               = p95(latency_values)

      // ── Hallucination rate ─────────────────────────────────────────────────
      // Count all claims across all results; tally CONTRADICTED + MISATTRIBUTED
      let totalClaims = 0
      let hallucinatedClaims = 0
      for (const r of results) {
        totalClaims += r.audit.claims.length
        hallucinatedClaims += r.audit.claims.filter(
          c => c.verdict === 'CONTRADICTED' || c.verdict === 'MISATTRIBUTED'
        ).length
      }
      const hallucination_rate = totalClaims > 0 ? hallucinatedClaims / totalClaims : 0

      // ── Confidence trend: last-7d vs last-30d ──────────────────────────────
      const last7Results = results.filter(r => r.created_at >= window7Start)
      const avg30 = avg_composite_score
      const avg7  = last7Results.length > 0 ? avg(last7Results.map(r => r.composite_score)) : avg30

      let confidence_trend: 'improving' | 'stable' | 'degrading'
      if (avg7 > avg30 * 1.05) {
        confidence_trend = 'improving'
      } else if (avg7 < avg30 * 0.95) {
        confidence_trend = 'degrading'
      } else {
        confidence_trend = 'stable'
      }

      return {
        model,
        domain,
        window_start:                  window30Start,
        window_end:                    now,
        total_benchmarks:              results.length,
        avg_composite_score,
        avg_accuracy_score,
        avg_claim_quality_score,
        avg_graph_utilization_score,
        avg_latency_ms,
        p95_latency_ms,
        hallucination_rate,
        confidence_trend,
        // Routing fields default — FeedbackLoop will populate from wm_model_routing_weights
        routing_weight: 1.0,
        demoted:        false,
      }
    } catch (err) {
      console.error('[ModelSelfBenchmark] Supabase unavailable during getModelProfile:', err)
      return null
    }
  }

  /**
   * Retrieve sorted performance leaderboard for all models in a given domain.
   *
   * Internally calls getModelProfile for every distinct model that has benchmark
   * results in the domain, then sorts by avg_composite_score descending.
   * Models with insufficient data (< 5 benchmarks in 30d) are excluded.
   *
   * @param domain - Domain to query (e.g. 'code', 'research')
   * @returns Array of ModelPerformanceProfile sorted best-first
   */
  async getLeaderboard(domain: string): Promise<ModelPerformanceProfile[]> {
    try {
      const window30Start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const { data, error } = await this.supabase
        .from('wm_benchmark_results')
        .select('model')
        .eq('domain', domain)
        .gte('created_at', window30Start.toISOString())

      if (error) {
        console.error('[ModelSelfBenchmark] getLeaderboard query failed:', error.message)
        return []
      }

      const rows = (data ?? []) as Array<{ model: string }>
      const uniqueModels = [...new Set(rows.map(r => r.model))]

      const profiles = await Promise.all(
        uniqueModels.map(m => this.getModelProfile(m, domain))
      )

      return profiles
        .filter((p): p is ModelPerformanceProfile => p !== null)
        .sort((a, b) => b.avg_composite_score - a.avg_composite_score)
    } catch (err) {
      console.error('[ModelSelfBenchmark] Supabase unavailable during getLeaderboard:', err)
      return []
    }
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Look up the p95 latency baseline for a given model name.
   * Uses partial, ordered matching (longest key wins) so 'gemini-flash'
   * is matched before the broader 'gemini' fallback.
   *
   * @param model - Model name (e.g. 'gemini-flash-1.5')
   * @returns Baseline in milliseconds
   */
  private getLatencyBaseline(model: string): number {
    const lower = model.toLowerCase()
    // Check longest keys first for specificity
    const keys = Object.keys(ModelSelfBenchmark.P95_LATENCY_BASELINES)
      .filter(k => k !== 'default')
      .sort((a, b) => b.length - a.length)

    for (const key of keys) {
      if (lower.includes(key)) {
        return ModelSelfBenchmark.P95_LATENCY_BASELINES[key]
      }
    }

    return ModelSelfBenchmark.P95_LATENCY_BASELINES['default']
  }
}
