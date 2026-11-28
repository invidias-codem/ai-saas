/**
 * lib/jepa/latentMcts.ts
 *
 * Latent-space Monte Carlo Tree Search with simulative reasoning.
 *
 * Instead of expanding raw syntax, this module operates on continuous
 * JEPA embeddings. Selection uses energy-based pruning (distance to
 * target latent state), expansion generates candidate action embeddings,
 * and rollout uses a predictor to simulate the next latent state entirely
 * in continuous space before invoking the LLM for concrete syntax.
 *
 * Serverless constraint: pure-functions over arrays; no external state,
 * no module-level singletons.
 *
 * Mechanics
 * --------
 * 1. Action formulation: encode a proposed code change into a dense action
 *    embedding, or accept an explicit delta vector.
 * 2. Latent rollout: apply the action embedding to the current state
 *    embedding to obtain a predicted future state embedding.
 * 3. Energy/distance scoring: compute cosine distance between the rollout
 *    embedding and the target embedding. MCTS uses this score to prune
 *    branches before syntactic generation.
 */

// ─── Public types ────────────────────────────────────────────────────────────

export interface LatentState {
  embedding: number[];
  source?: string;
  actionDescription?: string;
  /** VJEPA mean variance for this state, if available. */
  meanVariance?: number;
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
  /** Optional predictor; when omitted, rollout falls back to additive model. */
  predictor?: {
    predict(state: number[], action: number[]): number[];
  };
  /**
   * VJEPA variance penalty: penalize high-variance rollouts in UCB1 selection.
   * λ = 0.5 is a reasonable default. Set to 0 to disable variance-aware pruning.
   */
  variancePenaltyLambda?: number;
}

export interface LatentMctsResult {
  bestState: LatentState;
  bestAction: LatentAction | null;
  energy: number;
  iterations: number;
  summary: string;
}

// ─── Pure math helpers ───────────────────────────────────────────────────────

function l2norm(v: number[]): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

export function cosineDistance(a: number[], b: number[]): number {
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

// ─── Action formulation ──────────────────────────────────────────────────────

export function formulateAction(
  description: string,
  delta: number[],
): LatentAction {
  return { description, delta };
}

// ─── Latent rollout ─────────────────────────────────────────────────────────

export function latentRollout(
  stateEmbedding: number[],
  action: LatentAction,
  predictor?: LatentMctsOptions['predictor'],
): number[] {
  if (predictor) {
    return predictor.predict(stateEmbedding, action.delta);
  }
  return perturbEmbedding(stateEmbedding, action.delta);
}

// ─── Energy / distance scoring ───────────────────────────────────────────────

export function scoreEnergy(
  rolloutEmbedding: number[],
  targetEmbedding: number[] | undefined,
  energyWeight = 1.0,
): number {
  if (!targetEmbedding || targetEmbedding.length === 0) {
    return 0;
  }
  return energyWeight * cosineDistance(rolloutEmbedding, targetEmbedding);
}

// ─── MCTS core ───────────────────────────────────────────────────────────────

interface MctsNode {
  state: LatentState;
  action: LatentAction | null;
  energy: number;
  meanVariance: number;
  visits: number;
  value: number;
  children: MctsNode[];
  parent: MctsNode | null;
}

function ucb1Score(node: MctsNode, parentVisits: number, explorationConstant: number, variancePenaltyLambda: number): number {
  if (node.visits === 0) return Infinity;
  const exploit = node.value / node.visits;
  const explore = explorationConstant * Math.sqrt((2 * Math.log(parentVisits + 1)) / node.visits);
  const penalty = variancePenaltyLambda * (node.meanVariance ?? 0);
  return exploit + explore - penalty;
}

function selectBestChild(node: MctsNode, explorationConstant: number, variancePenaltyLambda: number): MctsNode | null {
  let best: MctsNode | null = null;
  let bestScore = -Infinity;
  for (const child of node.children) {
    const score = ucb1Score(child, node.visits, explorationConstant, variancePenaltyLambda);
    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }
  return best;
}

function isTerminal(node: MctsNode, maxDepth: number, depth: number, hasTarget: boolean): boolean {
  return depth >= maxDepth || (hasTarget && node.energy <= 0);
}

export function runLatentMcts(
  initialState: LatentState,
  actions: LatentAction[],
  options: LatentMctsOptions = {},
): LatentMctsResult {
  const maxIterations = options.maxIterations ?? 50;
  const maxDepth = options.maxDepth ?? 6;
  const explorationConstant = options.explorationConstant ?? 1.2;
  const energyWeight = options.energyWeight ?? 1.0;
  const variancePenaltyLambda = options.variancePenaltyLambda ?? 0;

  const root: MctsNode = {
    state: initialState,
    action: null,
    energy: computeEnergy(initialState, options.targetEmbedding),
    meanVariance: initialState.meanVariance ?? 0,
    visits: 0,
    value: 0,
    children: [],
    parent: null,
  };

  let iterations = 0;

  const hasTarget = (options.targetEmbedding?.length ?? 0) > 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1;
    let node: MctsNode = root;
    let depth = 0;

    // Selection
    while (node.children.length > 0 && !isTerminal(node, maxDepth, depth, hasTarget)) {
      const best = selectBestChild(node, explorationConstant, variancePenaltyLambda);
      if (!best) break;
      node = best;
      depth++;
    }

    // Expansion
    if (!isTerminal(node, maxDepth, depth, hasTarget) && actions.length > 0) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const nextEmbedding = latentRollout(node.state.embedding, action, options.predictor);
      const energy = scoreEnergy(nextEmbedding, options.targetEmbedding, energyWeight);
      const child: MctsNode = {
        state: { embedding: nextEmbedding, actionDescription: action.description, meanVariance: 0 },
        action,
        energy,
        meanVariance: 0,
        visits: 0,
        value: 0,
        children: [],
        parent: node,
      };
      node.children.push(child);
      node = child;
      depth++;
    }

    // Evaluation
    const value = 1.0 / (1.0 + node.energy);
    // Backpropagation
    let current: MctsNode | null = node;
    while (current) {
      current.visits += 1;
      current.value += value;
      current = current.parent;
    }
  }

  // Choose best child of root
  let bestChild: MctsNode | null = null;
  let bestAvg = -Infinity;
  for (const child of root.children) {
    const avg = child.visits > 0 ? child.value / child.visits : 0;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestChild = child;
    }
  }

  const bestAction = bestChild?.action ?? null;
  const bestState = bestChild?.state ?? root.state;

  return {
    bestState,
    bestAction,
    energy: bestState.embedding.length > 0 ? computeEnergy(bestState, options.targetEmbedding) : root.energy,
    iterations,
    summary: `MCTS iterations=${iterations} branches=${root.children.length} bestEnergy=${bestState.embedding.length > 0 ? computeEnergy(bestState, options.targetEmbedding).toFixed(4) : 'n/a'}`,
  };
}
