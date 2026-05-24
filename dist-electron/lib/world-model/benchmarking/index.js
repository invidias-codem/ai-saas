"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackLoop = exports.ModelSelfBenchmark = void 0;
exports.createBenchmarkingPipeline = createBenchmarkingPipeline;
__exportStar(require("./types"), exports);
var ModelSelfBenchmark_1 = require("./ModelSelfBenchmark");
Object.defineProperty(exports, "ModelSelfBenchmark", { enumerable: true, get: function () { return ModelSelfBenchmark_1.ModelSelfBenchmark; } });
var FeedbackLoop_1 = require("./FeedbackLoop");
Object.defineProperty(exports, "FeedbackLoop", { enumerable: true, get: function () { return FeedbackLoop_1.FeedbackLoop; } });
const ModelSelfBenchmark_2 = require("./ModelSelfBenchmark");
const FeedbackLoop_2 = require("./FeedbackLoop");
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
function createBenchmarkingPipeline(supabase, modelStore) {
    const benchmark = new ModelSelfBenchmark_2.ModelSelfBenchmark(supabase);
    const feedbackLoop = new FeedbackLoop_2.FeedbackLoop(supabase, modelStore);
    return { benchmark, feedbackLoop };
}
