// lib/intelligence/decision/replay/types.ts
// Slice 3: versioned replay record + frozen dataset contract.
// PURE: no I/O, no imports from supabase, no cloud SDKs.
// The ONLY job of this file is to describe the JSON that crosses the
// boundary between scripts/decision-routing-replay.ts and the kernel.

import type { DecisionFailureReason, DecisionLease } from '../contracts';

export type Tier = 'fast' | 'quality' | 'reasoning';
export type Effort = 'low' | 'medium' | 'high' | 'max';
export type OutcomeStatus = 'success' | 'partial' | 'failed' | 'clarified' | 'refused';
export type CorrectionSignal = 'none' | 'implicit' | 'explicit';

export interface RoutingReplayRecord {
  requestId: string;

  experiment: {
    planeSchemaVersion: number;
    questionSetVersion: number;
    tierPolicyVersion: number;
    engineId: string;
    engineModel: string;
  };

  judgment: {
    taskClass?: string;
    capability?: Tier;
    effort?: Effort;
    riskSignal?: number;
    lease?: DecisionLease;
  } | null;

  /** Present iff judgment === null. Keeps unavailable rows in the denominator. */
  decisionFailure?: {
    reason: DecisionFailureReason;
    attemptCount: number;
    latencyMs: number;
  };

  production: {
    intent: string;
    tier: Tier;
    modelRefs: string[];
    executionMode?: string;
  };

  outcome: {
    status: OutcomeStatus;
    latencyMs?: number;
    estimatedCostUsd?: number;
    correctionSignal?: CorrectionSignal;
  };
}

export interface ReplayDataset {
  datasetHash: string;
  records: RoutingReplayRecord[];
}

/** Per-record semantic tier proposal. NEVER provider names. */
export interface RoutingProposal {
  tier: Tier;
  effort?: Effort;
  lease?: DecisionLease;
  reasonCodes: string[];
}

export interface RoutingReplayPolicy {
  readonly id: string;
  readonly version: string;
  evaluate(record: RoutingReplayRecord): RoutingProposal;
}
