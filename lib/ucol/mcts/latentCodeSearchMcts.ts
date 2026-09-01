/**
 * lib/ucol/mcts/latentCodeSearchMcts.ts
 *
 * Latent-space MCTS substrate for code search.
 *
 * Wraps the existing CodeSearchMcts AST-level tree with JEPA-embedding-based
 * selection, HNSW similarity lookup against Supabase wm_edges, and
 * latent-space reward estimation.
 *
 * Flow
 * ----
 * 1. Query-Time Encoding: workspace state s_0 → v_0 via nimEmbeddingClient.
 * 2. HNSW Prefetch: RPC match_wm_edges(query=v_0) → nearest historical v_y.
 * 3. MCTS Expansion: deterministic AST mutations (default) or LLM-expanded
 *    semantic intents (opt-in via useLlmExpansion).
 * 4. Latent Simulation: predict ŷ = f(v_x, action) from JEPA predictor.
 * 5. Reward Estimation: min-distance(ŷ, top-K historical v_y) from HNSW.
 * 6. Backpropagate: reward up the tree.
 */

import { supabaseAdmin } from '@/lib/supabaseClient';
import { embed, DEFAULT_EMBED_DIM } from '@/lib/ai/nimEmbeddingClient';
import { cosineDistance } from '@/lib/jepa/latentMcts';
import {
  CodeSearchMcts,
  CodeSearchMctsNode,
  CodeSearchMctsOptions,
  CodeSearchState,
  CodeSearchResult,
  AstAction,
  generateAstActions,
  applyAstAction,
  createMctsNode,
  ucb1Score,
} from './codeSearchMcts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LatentCodeSearchMctsOptions extends CodeSearchMctsOptions {
  /** Use LLM to expand semantic action intents (default: false — deterministic only). */
  useLlmExpansion?: boolean;
  /** Number of nearest historical outcomes to retrieve via HNSW. */
  historyK?: number;
  /** Similarity threshold for HNSW match (0..1, default 0.6). */
  similarityThreshold?: number;
  /** Workspace/User scoping for RPC. */
  workspaceId?: string;
  userId?: string;
  /** Optional JEPA predictor endpoint override. */
  predictorEndpoint?: string;
}

export interface LatentCodeSearchResult extends CodeSearchResult {
  /** Historical matches retrieved from wm_edges. */
  historyMatches: Array<{ action: string; similarity: number }>;
  /** Root embedding v_0 used for this search. */
  rootEmbedding: number[];
}

// ---------------------------------------------------------------------------
// History lookup via Supabase RPC
// ---------------------------------------------------------------------------

interface WmEdgeMatch {
  id: bigint;
  workspace_id: string;
  user_id: string;
  v_x: string;
  action: string;
  v_y: string;
  similarity: number;
}

async function queryHistory(
  queryEmbedding: number[],
  opts: Required<Pick<LatentCodeSearchMctsOptions, 'historyK' | 'similarityThreshold' | 'workspaceId' | 'userId'>>,
): Promise<WmEdgeMatch[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin.rpc('match_wm_edges', {
    query_embedding: queryEmbedding,
    match_threshold: opts.similarityThreshold,
    match_count: opts.historyK,
    filter_workspace: opts.workspaceId ?? null,
    filter_user: opts.userId ?? null,
  });

  if (error) {
    console.error('[LatentMcts] match_wm_edges RPC failed', error);
    return [];
  }

  return (data as WmEdgeMatch[] | null) ?? [];
}

function parseVector(raw: string | number[]): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Latent predictor (lightweight JEPA approximation)
// ---------------------------------------------------------------------------

interface LatentPredictor {
  predict(state: number[], action: AstAction): Promise<number[]>;
}

class DefaultLatentPredictor implements LatentPredictor {
  private readonly endpoint: string;

  constructor(endpoint?: string) {
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    this.endpoint = endpoint
      ? (/^https?:/.test(endpoint) ? endpoint : `${base.replace(/\/$/, '')}${endpoint}`)
      : `${base}/api/jepa/predict`;
  }

  async predict(state: number[], action: AstAction): Promise<number[]> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stateEmbedding: state, action: action.description }),
        signal: AbortSignal.timeout(800),
      });
      if (!res.ok) throw new Error(`predictor ${res.status}`);
      const data = await res.json() as { embedding?: number[] };
      if (!data.embedding || !data.embedding.length) throw new Error('predictor returned empty embedding');
      return data.embedding;
    } catch {
      // Fallback: additive perturbation in latent space.
      const delta = this.actionToDelta(action);
      return state.map((v, i) => v + (delta[i] ?? 0));
    }
  }

  private actionToDelta(action: AstAction): number[] {
    // Produce a deterministic small perturbation from the action description.
    const dim = DEFAULT_EMBED_DIM;
    const out = new Array<number>(dim).fill(0);
    let h = 0;
    for (let i = 0; i < action.description.length; i++) {
      h = ((h << 5) - h + action.description.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(h) % dim;
    const mag = action.kind === 'delete_node' ? -0.05 : 0.05;
    out[idx] = mag;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Latent Code Search MCTS
// ---------------------------------------------------------------------------

export class LatentCodeSearchMcts {
  private readonly mcts: CodeSearchMcts;
  private readonly predictor: LatentPredictor;
  private readonly options: Required<LatentCodeSearchMctsOptions>;

  constructor(options: LatentCodeSearchMctsOptions = {}) {
    this.options = {
      ...options,
      useLlmExpansion: options.useLlmExpansion ?? false,
      historyK: options.historyK ?? 8,
      similarityThreshold: options.similarityThreshold ?? 0.6,
      workspaceId: options.workspaceId ?? 'default',
      userId: options.userId ?? 'anonymous',
      predictorEndpoint: options.predictorEndpoint ?? '',
      maxIterations: options.maxIterations,
      maxDepth: options.maxDepth,
      explorationConstant: options.explorationConstant,
      scorer: options.scorer,
      maxActionsPerNode: options.maxActionsPerNode,
    } as Required<LatentCodeSearchMctsOptions>;
    this.mcts = new CodeSearchMcts(options);
    this.predictor = new DefaultLatentPredictor(options.predictorEndpoint);
  }

  /**
   * Encode the active workspace state s_0 into v_0 via NIM embeddings.
   * Falls back to a zero-vector if NIM is unreachable.
   */
  async encodeRootState(state: CodeSearchState): Promise<number[]> {
    try {
      const result = await embed(state.source.slice(0, 8000));
      return result.vector;
    } catch {
      console.warn('[LatentMcts] NIM embed failed, using zero-vector root');
      return new Array<number>(DEFAULT_EMBED_DIM).fill(0);
    }
  }

  /**
   * Full latent-space search.
   *
   * 1. Encode root state → v_0.
   * 2. HNSW prefetch → historical matches.
   * 3. Run MCTS iterations with latent reward estimation.
   */
  async search(rootState: CodeSearchState): Promise<LatentCodeSearchResult> {
    const v0 = await this.encodeRootState(rootState);
    rootState.embedding = v0;

    // Pre-fetch historical outcomes.
    const historyMatches = await queryHistory(v0, this.options);
    const historyVectors = historyMatches.map((m) => parseVector(m.v_y));

    // Override MCTS simulation to use latent reward.
    const mctsResult = await this.runLatentSearch(rootState, v0, historyVectors);

    return {
      ...mctsResult,
      historyMatches: historyMatches.map((m) => ({ action: m.action, similarity: m.similarity })),
      rootEmbedding: v0,
    };
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async runLatentSearch(
    rootState: CodeSearchState,
    v0: number[],
    historyVectors: number[][],
  ): Promise<CodeSearchResult> {
    const root = createMctsNode(rootState, null, null);
    const maxIterations = this.options.maxIterations ?? 20;
    const maxDepth = this.options.maxDepth ?? 3;
    const exploration = this.options.explorationConstant ?? 1.414;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Selection
      const nodeToExpand = this.select(root, exploration);

      // Expansion
      if (this.getDepth(nodeToExpand) < maxDepth) {
        await this.expand(nodeToExpand);
      }

      // Simulation + reward
      const leaf =
        nodeToExpand.children.find((c) => c.visits === 0) ?? nodeToExpand;
      const reward = await this.simulateLatent(leaf, v0, historyVectors);

      // Backprop
      this.backpropagate(leaf, reward);
    }

    const bestChild = this.getBestChild(root, 0) ?? root;
    const score = await this.scoreNode(bestChild.state, v0);
    return {
      bestState: bestChild.state,
      bestAction: bestChild.actionTaken,
      divergence: score.divergence,
      iterations: maxIterations,
      summary: `[LatentMcts] best=${score.divergence.toFixed(4)} hist=${historyVectors.length} | ${score.detail}`,
    };
  }

  private async simulateLatent(
    node: CodeSearchMctsNode,
    v0: number[],
    historyVectors: number[][],
  ): Promise<number> {
    // Predict the next latent state ŷ = f(v_x, action).
    const predictedY = await this.predictor.predict(
      node.state.embedding ?? v0,
      node.actionTaken ?? { description: 'noop', kind: 'replace_node', targetStartByte: 0, targetEndByte: 0, replacementText: '' },
    );

    // Reward = 1 - min_cosine(ŷ, historical v_y).
    let bestDistance = 1.0;
    for (const hv of historyVectors) {
      const d = cosineDistance(predictedY, hv);
      if (d < bestDistance) bestDistance = d;
    }
    return 1 - bestDistance;
  }

  private async scoreNode(state: CodeSearchState, v0: number[]): Promise<{ divergence: number; detail: string }> {
    if (!state.embedding || !v0.length) {
      return { divergence: 1, detail: 'no-embedding' };
    }
    const d = cosineDistance(state.embedding, v0);
    return { divergence: d, detail: `cosine-v0=${d.toFixed(4)}` };
  }

  // ─── MCTS primitives ──────────────────────────────────────────────────────

  private select(node: CodeSearchMctsNode, exploration: number): CodeSearchMctsNode {
    let current: CodeSearchMctsNode = node;
    while (current.children.length > 0) {
      const unvisited = current.children.find((c) => c.visits === 0);
      if (unvisited) return unvisited;
      current = current.children.reduce((best, child) =>
        ucb1Score(child, exploration) > ucb1Score(best, exploration) ? child : best,
      );
    }
    return current;
  }

  private async expand(node: CodeSearchMctsNode): Promise<void> {
    const actions = generateAstActions(node.state, this.options.maxActionsPerNode ?? 3);
    if (this.options.useLlmExpansion) {
      // Augment with LLM-expanded actions (future: conversationEngine call).
      // Kept as a no-op placeholder so this code path is type-safe without
      // introducing a hard LLM dependency in the local-first path.
    }
    for (const action of actions) {
      const nextState = applyAstAction(node.state, action);
      node.children.push(createMctsNode(nextState, action, node));
    }
  }

  private backpropagate(node: CodeSearchMctsNode, reward: number): void {
    let current: CodeSearchMctsNode | null = node;
    while (current !== null) {
      current.visits += 1;
      current.totalReward += reward;
      current = current.parent;
    }
  }

  private getBestChild(node: CodeSearchMctsNode, _exploration: number): CodeSearchMctsNode | null {
    if (node.children.length === 0) return null;
    return node.children.reduce((best, child) =>
      (child.totalReward / (child.visits || 1)) > (best.totalReward / (best.visits || 1)) ? child : best,
    );
  }

  private getDepth(node: CodeSearchMctsNode): number {
    let depth = 0;
    let current: CodeSearchMctsNode | null = node;
    while (current?.parent !== null && current?.parent !== undefined) {
      depth++;
      current = current.parent;
    }
    return depth;
  }
}
