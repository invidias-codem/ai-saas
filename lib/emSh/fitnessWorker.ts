// lib/emSh/fitnessWorker.ts
// EMSH Fitness Evaluator — evaluates post-execution completion telemetry and
// emits append-only fitness events (recordFitnessEvent) plus an updated genotype
// fitness, closing the evolutionary loop.
//
// Outcome signals → fitness score (0..1):
//   * explicit user acceptance (thumbs up / resolved)  → strong positive
//   * error-free execution (no tool failures)          → moderate positive
//   * acceptable latency (within budget)               → mild positive
//   * explicit rejection / correction                  → negative pull
//
// The score is a blended, bounded signal; the genotype's rolling fitness is then
// recomputed from its full fitness-event lineage (append-only, never in-place).
// Cold-start genotypes (few events) start at the neutral 0.5 prior.

import { recordFitnessEvent } from './genotypeStore';
import type { FitnessSignal } from './types';

export interface CompletionTelemetry {
  genotypeId: string;
  /** Optional source session id for lineage tracing. */
  sessionId?: string | null;
  /** Explicit user acceptance signal (true/false/undefined = no explicit signal). */
  userAccepted?: boolean;
  /** Whether the execution completed with zero tool errors. */
  errorFree?: boolean;
  /** Measured end-to-end latency ms. */
  latencyMs?: number;
  /** Latency budget against which mild positive/negative is scored. */
  latencyBudgetMs?: number;
  /** Any explicit correction/negative-connotation signal. */
  userCorrected?: boolean;
}

const PRIOR_NEUTRAL = 0.5; // cold-start prior

function cosh(x: number): number {
  return (Math.exp(x) + Math.exp(-x)) / 2;
}

/**
 * Convert outcome telemetry into a bounded fitness score in (0, 1).
 * Uses a logistic squash so individual strong signals can't pin the score to 0/1.
 */
export function scoreCompletion(t: CompletionTelemetry): number {
  let evidence = 0;

  if (t.userAccepted === true) evidence += 1.5;
  if (t.userCorrected === true) evidence -= 1.5;
  if (t.errorFree === true) evidence += 0.6;
  if (t.errorFree === false) evidence -= 0.6;

  if (typeof t.latencyMs === 'number' && typeof t.latencyBudgetMs === 'number') {
    const ratio = t.latencyMs / Math.max(1, t.latencyBudgetMs);
    // Mild positive if under budget, mild negative if over.
    evidence += ratio <= 1 ? 0.3 : -0.3;
  }

  // Logistic squash into (0,1), centered on the neutral prior by shifting evidence.
  const score = 1 / (1 + Math.exp(-evidence));
  return Math.min(0.999, Math.max(0.001, score));
}

/**
 * Evaluate and record a fitness event for the completion of a genotype-backed
 * execution. Returns the scored fitness (0..1) so callers can log/chain it.
 */
export async function evaluateCompletion(
  telemetry: CompletionTelemetry
): Promise<number> {
  const score = scoreCompletion(telemetry);

  // Signal classification for the append-only lineage.
  const signal: FitnessSignal =
    telemetry.userAccepted === true || telemetry.userCorrected === true
      ? 'explicit'
      : telemetry.errorFree === false
        ? 'delta'
        : 'semantic';

  const ok = await recordFitnessEvent({
    genotypeId: telemetry.genotypeId,
    score,
    signal,
    sourceSessionId: telemetry.sessionId ?? null,
  });

  if (!ok) {
    console.warn('[fitnessWorker] Failed to record fitness event for', telemetry.genotypeId);
  }
  return score;
}

/**
 * Recompute a genotype's rolling fitness from its full event lineage.
 * Averaged with a neutral prior so low-sample genotypes don't overfit single
 * outcomes. (Wiring note: requires a `listFitnessEvents(genotypeId)` accessor in
 * genotypeStore — call from background workers, not the hot path.)
 */
export function rollingFitnessFromEvents(
  scores: number[],
  priorWeight = 2
): number {
  if (scores.length === 0) return PRIOR_NEUTRAL;
  const sum = scores.reduce((a, b) => a + b, 0) + PRIOR_NEUTRAL * priorWeight;
  return sum / (scores.length + priorWeight);
}