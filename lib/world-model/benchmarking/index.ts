/**
 * World Model — Benchmarking Module
 * Tech Genie / UCOL Architecture
 *
 * Public surface for the Model Self-Benchmarking Feedback Loop.
 *
 * Exports:
 *  - All types (BenchmarkResult, ModelPerformanceProfile, …)
 *  - ModelSelfBenchmark  — per-response scoring engine
 *  - FeedbackLoop        — routing weight & demotion orchestrator
 *  - createBenchmarkingPipeline — factory for wiring the full pipeline
 *
 * Usage:
 * ```ts
 * import { createBenchmarkingPipeline } from '@/lib/world-model/benchmarking'
 * const { benchmark, feedbackLoop } = createBenchmarkingPipeline(supabase, modelStore)
 * ```
 *
 * See: research/world-model/ML_ARCHITECTURE.md
 */

export * from './types'
export { ModelSelfBenchmark } from './ModelSelfBenchmark'
export { FeedbackLoop } from './FeedbackLoop'

import type { SupabaseClient } from '@supabase/supabase-js'
import { ModelStore } from '../ml/ModelStore'
import { ModelSelfBenchmark } from './ModelSelfBenchmark'
import { FeedbackLoop } from './FeedbackLoop'

/**
 * Factory that wires together ModelSelfBenchmark and FeedbackLoop into a
 * ready-to-use pipeline.
 *
 * @param supabase   - Initialized Supabase client (service role recommended)
 * @param modelStore - ModelStore instance for routing training examples
 * @returns Object containing both benchmark and feedbackLoop instances
 *
 * @example
 * ```ts
 * const { benchmark, feedbackLoop } = createBenchmarkingPipeline(supabase, modelStore)
 *
 * // Score a response after each AI call:
 * const result = await benchmark.scoreResponse({ sessionId, model, domain, audit, latencyMs })
 *
 * // Run the feedback loop (e.g. on a cron schedule):
 * const cycle = await feedbackLoop.runCycle()
 * console.log(`Processed ${cycle.benchmarks_processed} benchmarks`)
 * ```
 */
export function createBenchmarkingPipeline(
  supabase: SupabaseClient,
  modelStore: ModelStore
): { benchmark: ModelSelfBenchmark; feedbackLoop: FeedbackLoop } {
  const benchmark    = new ModelSelfBenchmark(supabase)
  const feedbackLoop = new FeedbackLoop(supabase, modelStore)
  return { benchmark, feedbackLoop }
}
