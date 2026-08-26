/**
 * lib/jepa/latentMcts.ts
 *
 * Latent-space Monte Carlo Tree Search extension.
 *
 * Instead of expanding raw syntax, this module operates on continuous
 * JEPA embeddings. Selection uses energy-based pruning (distance to
 * target latent state), and expansion generates candidate perturbation
 * vectors rather than AST actions.
 *
 * Serverless constraint: all operations are pure-functions over arrays;
 * no external state, no module-level singletons.
 */

export interface LatentState {
  embedding: number[];
  source?: string;
  actionDescription?: string;
}

export interface LatentAction {
  description: string;
  /** Direction vector to add to the parent embedding. */
  delta: number[];
}

export interface LatentMctsOptions {
  maxIterations?: number;
  maxDepth?: number;
  explorationConstant?: number;
  energyWeight?: number;
  /** Optional target latent state; when omitted, energy is disabled. */
  targetEmbedding?: number[];
}

export interface LatentMctsResult {
  bestState: LatentState;
  bestAction: LatentAction | null;
  energy: number;
  iterations: number;
  summary: string;
}

function l2norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  const cosineSim = denom > 0 ? dot / denom : 0;
  return (1 - cosineSim) / 2;
}

export function computeEnergy(state: LatentState, targetEmbedding: number[] | undefined): number {
  if (!targetEmbedding || targetEmbedding.length === 0 || state.embedding.length === 0) {
    return 0;
  }
  return cosineDistance(state.embedding, targetEmbedding);
}

export function perturbEmbedding(base: number[], delta: number[]): number[] {
  const out = new Array<number>(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = base[i] + (delta[i] ?? 0);
  }
  return out;
}
