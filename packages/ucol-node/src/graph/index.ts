/**
 * @file graph/index.ts
 * @description GraphRAG memory architecture — temporal decay and spreading activation.
 * Implements spec §9: graph schema, temporal decay formula, spreading activation algorithm.
 */

import type { UUID, Confidence } from '../store/schema.js';

// ─── Graph Node Types (§9.1) ─────────────────────────────────────────────────

export interface GraphEntity {
  id: UUID;
  label: string;
  type: string;
  embedding: number[] | null;
  confidence: Confidence;
  decayWeight: number;        // current weight after decay
  lastReinforcedAt: Date;
  createdAt: Date;
  accessCount: number;
}

export interface GraphCommunity {
  id: UUID;
  summary: string;
  level: number;              // 0 = leaf, higher = more abstract
  memberIds: UUID[];
  embedding: number[] | null;
}

export interface GraphEdge {
  source: UUID;
  target: UUID;
  weight: Confidence;
  coOccurrenceCount: number;
  type: 'RELATES_TO' | 'CAUSAL' | 'TEMPORAL' | 'PART_OF';
}

// ─── Activation result ───────────────────────────────────────────────────────

export interface ActivatedNode {
  id: UUID;
  activation: number;
  hopDistance: number;
}

// ─── Temporal Decay Parameters (§9.2) ────────────────────────────────────────

/** Default decay rates per KnowledgeType */
export const DECAY_RATES: Record<string, number> = {
  CONSTRAINT:  0.001,   // very slow — constraints are durable
  GOAL:        0.002,   // slow — goals are intentional
  FACT:        0.005,   // default
  PREFERENCE:  0.010,   // moderate — preferences drift
  ASSERTION:   0.008,
};

/** Minimum weight floor — entities never fully expire */
const WEIGHT_FLOOR = 0.05;

/**
 * Compute the current decay weight for an entity.
 * Formula (spec §9.2): weight(t) = weight_initial × e^(-λ × Δt_days)
 *
 * @param weightInitial - The weight at last reinforcement
 * @param lastReinforcedAt - Timestamp of last reinforcement event
 * @param decayRate - λ value (default 0.005 per day)
 * @param now - Reference time (default: current time)
 */
export function computeDecayWeight(
  weightInitial: number,
  lastReinforcedAt: Date,
  decayRate: number = DECAY_RATES.FACT,
  now: Date = new Date(),
): number {
  const deltaDays = (now.getTime() - lastReinforcedAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayed = weightInitial * Math.exp(-decayRate * deltaDays);
  return Math.max(decayed, WEIGHT_FLOOR);
}

/**
 * Check whether an entity should be considered "active" (above floor).
 */
export function isActiveEntity(entity: GraphEntity, now: Date = new Date()): boolean {
  const currentWeight = computeDecayWeight(
    entity.decayWeight,
    entity.lastReinforcedAt,
    DECAY_RATES[entity.type] ?? DECAY_RATES.FACT,
    now,
  );
  return currentWeight > WEIGHT_FLOOR + 0.001;
}

// ─── Spreading Activation (§9.3) ─────────────────────────────────────────────

/** Spreading activation parameters */
export interface SpreadingActivationConfig {
  /** Maximum hops from seed nodes (spec default: 3, max: 5) */
  depthLimit?: number;
  /** Minimum edge weight to traverse (spec default: 0.15) */
  activationThreshold?: number;
  /** Activation multiplier per hop (spec default: 0.6) */
  hopDecay?: number;
}

const DEFAULT_SA_CONFIG: Required<SpreadingActivationConfig> = {
  depthLimit: 3,
  activationThreshold: 0.15,
  hopDecay: 0.6,
};

/**
 * Spreading activation algorithm from spec §9.3.
 * Given seed entity IDs and their neighbours (as adjacency map), returns
 * all reachable nodes sorted by activation score descending.
 *
 * The caller is responsible for providing the adjacency map from storage.
 *
 * @param seedIds - Starting entity IDs (activation = 1.0)
 * @param adjacency - Map of entityId → list of (neighbourId, edgeWeight) pairs
 * @param config - Tuning parameters
 */
export function spreadingActivation(
  seedIds: UUID[],
  adjacency: Map<UUID, Array<{ id: UUID; weight: number }>>,
  config: SpreadingActivationConfig = {},
): ActivatedNode[] {
  const { depthLimit, activationThreshold, hopDecay } = {
    ...DEFAULT_SA_CONFIG,
    ...config,
  };

  const activation = new Map<UUID, number>();
  const hopDistance = new Map<UUID, number>();
  const visited = new Set<UUID>();

  // Seed nodes start at activation 1.0
  for (const id of seedIds) {
    activation.set(id, 1.0);
    hopDistance.set(id, 0);
    visited.add(id);
  }

  let queue: UUID[] = [...seedIds];

  for (let hop = 1; hop <= depthLimit; hop++) {
    const nextQueue: UUID[] = [];

    for (const entityId of queue) {
      const parentActivation = activation.get(entityId) ?? 0;
      const neighbours = adjacency.get(entityId) ?? [];

      for (const { id: neighbourId, weight: edgeWeight } of neighbours) {
        if (visited.has(neighbourId)) continue;
        if (edgeWeight < activationThreshold) continue;

        const neighbourActivation = parentActivation * edgeWeight * hopDecay;
        activation.set(neighbourId, neighbourActivation);
        hopDistance.set(neighbourId, hop);
        visited.add(neighbourId);
        nextQueue.push(neighbourId);
      }
    }

    queue = nextQueue;
    if (queue.length === 0) break;
  }

  // Sort by activation descending
  return Array.from(activation.entries())
    .map(([id, act]) => ({
      id,
      activation: act,
      hopDistance: hopDistance.get(id) ?? 0,
    }))
    .sort((a, b) => b.activation - a.activation);
}

/**
 * Lightweight cosine similarity between two equal-length vectors.
 * Used by Engram deduplication and Doubt Engine.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
