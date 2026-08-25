/**
 * lib/ucol/mcts/codeSearchMcts.ts
 *
 * MCTS tree-search loop for candidate code evaluation.
 *
 * Relationship to MctsResolverNode.ts:
 *   MctsResolverNode.ts is scoped to error resolution — it uses file-diff
 *   actions and an LLM Critic as the value function. This module is a
 *   separate code-search MCTS that uses AST-level actions and JEPA latent
 *   divergence as the value function. The two trees may coexist in the same
 *   runtime without sharing state.
 *
 * Stage 0 acceptance criteria (§8 of spec):
 *  "MCTS loop can expand and evaluate at least 3 candidate ASTs per
 *   selection cycle, using JEPA divergence or a stub scorer as the value
 *   function."
 *
 * Stage 1/2 work:
 *  1. Replace JepaDivergenceStubScorer with real WASM-backed JEPA encoder
 *     + predictor calls through treeSitterLoader.ts.
 *  2. Expand the AST action space beyond the three stub actions below.
 *  3. Add AST structural hashing for dedup (prevent re-expanding identical
 *     candidates).
 */

import { serializeAstForJepa } from "@/lib/jepa/astEncoderInput";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Canonical language identifiers. */
export type AstLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'go' | 'python' | 'unknown';

/**
 * Lightweight AST node representation used by the MCTS action space.
 * In Stage 1/2 this wraps the web-tree-sitter NodeAdapter; in Stage 0 it is
 * a plain data object.
 */
export interface AstNode {
  /** Tree-sitter node type (e.g. "function_declaration", "binary_expression"). */
  type: string;
  /** 0-indexed start position in the source text. */
  startByte: number;
  /** Exclusive end position in the source text. */
  endByte: number;
  /** Source text spanned by this node. */
  text: string;
  /** Child nodes. */
  children: AstNode[];
}

/**
 * The MCTS state represents one candidate code AST. In Stage 0 the source
 * text is also held so the stub scorer can compute a structural distance
 * without WASM.
 */
export interface CodeSearchState {
  /** The full source text of this candidate. */
  source: string;
  /** Language of the source. */
  language: AstLanguage;
  /** Root AST node. */
  root: AstNode;
  /** Serialized AST token sequence (filled in by the encoder in Stage 1/2). */
  astTokens?: string;
  /** JEPA latent embedding for this candidate (null when encoder unavailable). */
  embedding?: number[] | null;
  /** Free-form metadata (e.g. generation temperature, LLM provider). */
  metadata?: Record<string, string>;
}

/**
 * An AST-level action that transforms one code state into another.
 * In Stage 0 the actions are stubs; Stage 1/2 expands this to real
 * tree-sitter node transformations.
 */
export interface AstAction {
  /** Human-readable description of the move. */
  description: string;
  /** Which action kind this is. */
  kind: 'replace_node' | 'insert_before' | 'insert_after' | 'delete_node';
  /** Target node start byte in the source text (used by the transformer). */
  targetStartByte: number;
  /** Target node end byte in the source text. */
  targetEndByte: number;
  /** Replacement text (for replace_node), or inserted text (insert_*). */
  replacementText: string;
}

/**
 * Score returned by the JEPA divergence scorer.
 *   - divergence: scalar distance (lower = more similar to predictor expectation).
 *   - confidence: how reliable the score is (0 = stub guess, 1 = real encoder).
 */
export interface JepaDivergenceScore {
  divergence: number;  // 0..1
  confidence: number;  // 0..1
  detail: string;      // human-readable explanation
}

// ─── AST Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a plain AstNode tree from a tree-sitter NodeAdapter.
 * Falls back to a text-based stub when the adapter is unavailable (Stage 0).
 */
export function buildAstFromSource(source: string, _language: AstLanguage): AstNode {
  // Stage 0 stub: produce a synthetic "text" root node. Stage 1/2 replaces
  // this with a real tree-sitter parse.
  return {
    type: 'text_block',
    startByte: 0,
    endByte: source.length,
    text: source,
    children: [],
  };
}

/**
 * Apply an AstAction to a CodeSearchState and return a new state with the
 * transformed source. Stage 0 implementation does simple string surgery;
 * Stage 1/2 delegates to a tree-sitter-aware transformer.
 */
export function applyAstAction(state: CodeSearchState, action: AstAction): CodeSearchState {
  let newSource: string;

  switch (action.kind) {
    case 'replace_node':
      newSource =
        state.source.slice(0, action.targetStartByte) +
        action.replacementText +
        state.source.slice(action.targetEndByte);
      break;
    case 'insert_before':
      newSource =
        state.source.slice(0, action.targetStartByte) +
        action.replacementText +
        state.source.slice(action.targetStartByte);
      break;
    case 'insert_after':
      newSource =
        state.source.slice(0, action.targetEndByte) +
        action.replacementText +
        state.source.slice(action.targetEndByte);
      break;
    case 'delete_node':
      newSource =
        state.source.slice(0, action.targetStartByte) +
        state.source.slice(action.targetEndByte);
      break;
    default:
      newSource = state.source;
  }

  return {
    ...state,
    source: newSource,
    root: buildAstFromSource(newSource, state.language),
    astTokens: undefined,
    embedding: null,
    metadata: {
      ...state.metadata,
      lastAction: action.description,
    },
  };
}

// ─── JEPA Divergence Scorer ───────────────────────────────────────────────────

/**
 * JepaDivergenceScorer computes a scalar divergence score between a candidate
 * AST state and the JEPA predictor's expectation.
 *
 * Stage 0: Stub scorer — produces a deterministic pseudo-random score based
 *   on the source text hash. This lets the MCTS loop be exercised end-to-end
 *   without WASM or a trained encoder.
 *
 * Stage 1/2: Real scorer — encodes the candidate via UniXcoder ONNX/WASM,
 *   compares to the predictor's pre-computed ŷ via cosine distance, and
 *   returns the L2 norm as the divergence.
 */
export class JepaDivergenceScorer {
  private readonly jepaEndpoint: string;
  private readonly latencyBudgetMs: number;
  private readonly fallbackEnabled: boolean;

  constructor(opts?: {
    jepaEndpoint?: string;
    latencyBudgetMs?: number;
    fallbackEnabled?: boolean;
  }) {
    this.jepaEndpoint = opts?.jepaEndpoint ?? '/api/jepa/infer';
    this.latencyBudgetMs = opts?.latencyBudgetMs ?? 600;
    this.fallbackEnabled = opts?.fallbackEnabled ?? true;
  }

  async score(
    predictedEmbedding: number[] | null | undefined,
    state: CodeSearchState,
    predictorId: string = 'jepa-wasm-v1',
  ): Promise<JepaDivergenceScore> {
    // Fast path: already have embeddings from a previous real encode.
    if (predictedEmbedding && state.embedding) {
      return this.cosineDistanceScore(predictedEmbedding, state.embedding, predictorId);
    }

    // Stage 1/2 real path: ask the JEPA encoder endpoint for the candidate embedding.
    if (!predictedEmbedding && !state.embedding) {
      return this.encodeAndScore(state, predictorId);
    }

    // Partial data: predicted exists but candidate embedding missing.
    if (predictedEmbedding && !state.embedding) {
      return this.encodeAndScore(state, predictorId, predictedEmbedding);
    }

    // Should not reach here, but fall back safely.
    return this.stubScore(state.source, predictorId);
  }

  private async encodeAndScore(
    state: CodeSearchState,
    predictorId: string,
    predictedEmbedding?: number[],
  ): Promise<JepaDivergenceScore> {
    const started = Date.now();
    try {
      const astTokens = state.astTokens ?? serializeAstForJepa(state.source, state.language);
      const res = await fetch(this.jepaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ astTokens, language: state.language }),
      });

      const totalMs = Date.now() - started;
      if (!res.ok) {
        throw new Error(`JEPA encoder responded ${res.status}`);
      }

      const data = await res.json() as { status: string; embedding?: number[]; totalMs?: number; fallbackToSyntactic?: boolean; error?: string };
      if (data.status === 'error' || !data.embedding) {
        throw new Error(data.error || 'JEPA encoder returned no embedding');
      }

      // Circuit breaker: if the encoder itself reports latency spike / fallback,
      // or if our measured latency exceeds budget, fall back to stub scoring.
      if ((data.totalMs && data.totalMs > this.latencyBudgetMs) || totalMs > this.latencyBudgetMs) {
        return {
          divergence: 1,
          confidence: 0,
          detail: `circuit-breaker:jepa-latency=${totalMs}ms predictor=${predictorId}`,
        };
      }

      if (data.fallbackToSyntactic && this.fallbackEnabled) {
        return {
          divergence: 1,
          confidence: 0,
          detail: `circuit-breaker:jepa-fallback predictor=${predictorId}`,
        };
      }

      // Cache the embedding on the state so subsequent simulations reuse it.
      state.embedding = data.embedding;

      if (predictedEmbedding) {
        return this.cosineDistanceScore(predictedEmbedding, data.embedding, predictorId);
      }

      // No predicted embedding yet: return a stub score keyed by the actual embedding magnitude.
      const magnitude = Math.sqrt(data.embedding.reduce((sum, v) => sum + v * v, 0));
      const divergence = Math.min(1, Math.max(0, 1 - magnitude / 100));
      return {
        divergence,
        confidence: 0.5,
        detail: `jepa-encoder:latency=${totalMs}ms magnitude=${magnitude.toFixed(2)} predictor=${predictorId}`,
      };
    } catch (err) {
      // Fail-closed: on any encoder failure, return maximum divergence and let
      // the MCTS loop back out to syntactic planning via the conversation engine.
      return {
        divergence: 1,
        confidence: 0,
        detail: `encoder-failed:${String(err)} predictor=${predictorId}`,
      };
    }
  }

  /**
   * Stub scorer: deterministic pseudo-random divergence from source hash.
   * Same source → same score, satisfying the determinism constraint.
   */
  private stubScore(source: string, predictorId: string): JepaDivergenceScore {
    // Simple deterministic hash.
    let h = 0;
    for (let i = 0; i < source.length; i++) {
      h = ((h << 5) - h + source.charCodeAt(i)) | 0;
    }
    const raw = Math.abs(h) / 0x7fffffff; // 0..1
    // Clamp to [0, 1] and invert so shorter/unique sources score low divergence.
    const divergence = Math.min(1, Math.max(0, raw));
    return {
      divergence,
      confidence: 0,   // stub — not a real model score
      detail: `stub-scorer:hash=${Math.abs(h).toString(16)} predictor=${predictorId}`,
    };
  }

  /**
   * Real scorer: cosine distance between two embedding vectors.
   * Both vectors must be the same dimension.
   */
  private cosineDistanceScore(a: number[], b: number[], predictorId: string): JepaDivergenceScore {
    if (a.length !== b.length) {
      return { divergence: 1, confidence: 0, detail: 'dimension-mismatch' };
    }

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
    // Convert similarity in [-1, 1] to divergence in [0, 1].
    const divergence = (1 - cosineSim) / 2;

    return {
      divergence: Math.min(1, Math.max(0, divergence)),
      confidence: 1,   // real model score
      detail: `cosine:sim=${cosineSim.toFixed(4)} divergence=${divergence.toFixed(4)} predictor=${predictorId}`,
    };
  }
}

// ─── MCTS Node ────────────────────────────────────────────────────────────────

export interface CodeSearchMctsNode {
  /** State represented by this node. */
  state: CodeSearchState;
  /** Action that led to this node from its parent. */
  actionTaken: AstAction | null;
  /** Parent node (null for root). */
  parent: CodeSearchMctsNode | null;
  /** Expanded children. */
  children: CodeSearchMctsNode[];
  /** Number of visits (simulations through this node). */
  visits: number;
  /** Sum of rewards from simulations. */
  totalReward: number;
}

export function createMctsNode(
  state: CodeSearchState,
  actionTaken: AstAction | null = null,
  parent: CodeSearchMctsNode | null = null,
): CodeSearchMctsNode {
  return {
    state,
    actionTaken,
    parent,
    children: [],
    visits: 0,
    totalReward: 0,
  };
}

/** UCB1 score — higher means more promising. */
export function ucb1Score(node: CodeSearchMctsNode, exploration: number = 1.414): number {
  if (node.visits === 0) return Infinity;
  const exploit = node.totalReward / node.visits;
  const explore = exploration * Math.sqrt(Math.log(node.parent?.visits ?? 1) / node.visits);
  return exploit + explore;
}

// ─── Action Generator ─────────────────────────────────────────────────────────

/**
 * Generate up to N AST-level actions from a given state.
 *
 * Stage 0: produces three deterministic stub actions (replace first 8
 *   chars, insert a comment line, delete a trailing block) so the MCTS
 *   loop can be exercised without a real AST parser.
 *
 * Stage 1/2: uses tree-sitter to generate semantically meaningful edits
 *   (e.g., "rename variable", "extract method").
 */
export function generateAstActions(state: CodeSearchState, maxActions: number = 3): AstAction[] {
  const actions: AstAction[] = [];
  const source = state.source;
  const len = source.length;

  if (len === 0) return actions;

  // Stub action 1: replace the first identifier-like region with a no-op wrapper.
  const firstWordEnd = source.search(/\s/);
  if (firstWordEnd > 0 && firstWordEnd < 80) {
    actions.push({
      description: `wrap-first-token: "${source.slice(0, firstWordEnd)}"`,
      kind: 'replace_node',
      targetStartByte: 0,
      targetEndByte: firstWordEnd,
      replacementText: `/*jepa-stub*/ ${source.slice(0, firstWordEnd)}`,
    });
  }

  // Stub action 2: insert a no-op line at the end of the file.
  if (len > 0) {
    actions.push({
      description: 'append-noop-line',
      kind: 'insert_after',
      targetStartByte: len,
      targetEndByte: len,
      replacementText: '\n// JEPA code-search candidate\n',
    });
  }

  // Stub action 3: if the source has a trailing block, offer a delete.
  const lastBrace = source.lastIndexOf('}');
  if (lastBrace > 0 && lastBrace > len * 0.8) {
    actions.push({
      description: 'trim-trailing-brace',
      kind: 'delete_node',
      targetStartByte: lastBrace,
      targetEndByte: len,
      replacementText: '',
    });
  }

  // Deterministic sort so the same source always yields the same action set.
  return actions.sort((a, b) => a.description.localeCompare(b.description)).slice(0, maxActions);
}

// ─── Code Search MCTS ─────────────────────────────────────────────────────────

export interface CodeSearchMctsOptions {
  /** Maximum MCTS iterations (default 20). */
  maxIterations?: number;
  /** Maximum tree depth before forced simulation (default 3). */
  maxDepth?: number;
  /** UCB1 exploration constant (default 1.414). */
  explorationConstant?: number;
  /** Divergence scorer instance (defaults to new JepaDivergenceScorer). */
  scorer?: JepaDivergenceScorer;
  /** Maximum actions to expand per node (default 3, matching spec). */
  maxActionsPerNode?: number;
}

export interface CodeSearchResult {
  /** Best candidate state found. */
  bestState: CodeSearchState;
  /** Action taken to reach the best state from the root. */
  bestAction: AstAction | null;
  /** Divergence score of the best state. */
  divergence: number;
  /** Total iterations performed. */
  iterations: number;
  /** Summary for logging. */
  summary: string;
}

/**
 * MCTS loop for candidate code search.
 *
 * Usage:
 *
 *   const mcts = new CodeSearchMcts({ maxIterations: 10 });
 *   const result = await mcts.search(initialState, predictedEmbedding);
 */
export class CodeSearchMcts {
  private readonly maxIterations: number;
  private readonly maxDepth: number;
  private readonly explorationConstant: number;
  private readonly scorer: JepaDivergenceScorer;
  private readonly maxActionsPerNode: number;

  constructor(options: CodeSearchMctsOptions = {}) {
    this.maxIterations      = options.maxIterations ?? 20;
    this.maxDepth           = options.maxDepth ?? 3;
    this.explorationConstant = options.explorationConstant ?? 1.414;
    this.scorer             = options.scorer ?? new JepaDivergenceScorer();
    this.maxActionsPerNode  = options.maxActionsPerNode ?? 3;
  }

  /**
   * Run the MCTS search and return the best candidate.
   *
   * @param rootState          - Initial candidate state (before any edits).
   * @param predictedEmbedding - JEPA predictor's expected latent (may be null in Stage 0).
   * @returns CodeSearchResult
   */
  async search(rootState: CodeSearchState, predictedEmbedding: number[] | null | undefined): Promise<CodeSearchResult> {
    const root = createMctsNode(rootState, null, null);
    let bestResult: CodeSearchResult;

    try {
      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        // 1. SELECTION — traverse the tree via UCB1.
        const nodeToExpand = this.select(root);

        // 2. EXPANSION — generate up to maxActionsPerNode children.
        if (this.getDepth(nodeToExpand) < this.maxDepth) {
          await this.expand(nodeToExpand);
        }

        // 3. SIMULATION — evaluate an unvisited child (or the node itself).
        const nodeToSimulate =
          nodeToExpand.children.find(c => c.visits === 0) ?? nodeToExpand;

        const reward = await this.simulate(nodeToSimulate, predictedEmbedding);

        // 4. BACKPROPAGATION — update visit counts and rewards.
        this.backpropagate(nodeToSimulate, reward);
      }

      // Select the best child by highest average reward (pure exploitation).
      const bestChild = this.getBestChild(root, 0);
      const bestNode = bestChild ?? root;

      const score = await this.scorer.score(predictedEmbedding, bestNode.state, 'code-search-mcts');

      bestResult = {
        bestState: bestNode.state,
        bestAction: bestNode.actionTaken,
        divergence: score.divergence,
        iterations: this.maxIterations,
        summary: `MCTS code-search: best divergence=${score.divergence.toFixed(4)} confidence=${score.confidence} | ${score.detail}`,
      };
    } catch (err) {
      // Return the initial state on catastrophic failure so callers never
      // receive undefined.
      const score = await this.scorer.score(predictedEmbedding, rootState, 'code-search-mcts');
      bestResult = {
        bestState: rootState,
        bestAction: null,
        divergence: score.divergence,
        iterations: 0,
        summary: `MCTS code-search failed: ${String(err)} — returning initial state.`,
      };
    }

    return bestResult;
  }

  // ─── MCTS Phases ────────────────────────────────────────────────────────────

  /** Selection: follow UCB1 down the tree to an expandable node. */
  private select(node: CodeSearchMctsNode): CodeSearchMctsNode {
    let current = node;
    while (current.children.length > 0) {
      const unvisited = current.children.find(c => c.visits === 0);
      if (unvisited) return unvisited;
      current = current.children.reduce((best, child) =>
        ucb1Score(child, this.explorationConstant) > ucb1Score(best, this.explorationConstant) ? child : best
      );
    }
    return current;
  }

  /** Expansion: generate AST actions and create child nodes. */
  private async expand(node: CodeSearchMctsNode): Promise<void> {
    const actions = generateAstActions(node.state, this.maxActionsPerNode);
    for (const action of actions) {
      const nextState = applyAstAction(node.state, action);
      node.children.push(createMctsNode(nextState, action, node));
    }
  }

  /**
   * Simulation: evaluate a node using the JEPA divergence scorer.
   *
   * Stage 0: scorer returns a deterministic pseudo-random divergence.
   * Stage 1/2: scorer encodes the candidate and computes real cosine distance.
   *
   * Reward = 1 - divergence (higher reward = lower divergence = closer to prediction).
   */
  private async simulate(node: CodeSearchMctsNode, predictedEmbedding: number[] | null | undefined): Promise<number> {
    const score = await this.scorer.score(predictedEmbedding, node.state, 'code-search-mcts');
    // Convert divergence [0,1] to reward [0,1] where 1 = perfect match.
    return 1 - score.divergence;
  }

  /** Backpropagation: update visit counts and total rewards up to root. */
  private backpropagate(node: CodeSearchMctsNode, reward: number): void {
    let current: CodeSearchMctsNode | null = node;
    while (current !== null) {
      current.visits += 1;
      current.totalReward += reward;
      current = current.parent;
    }
  }

  /** Select the best child by average reward (exploitation). */
  private getBestChild(node: CodeSearchMctsNode, explorationParam: number): CodeSearchMctsNode | null {
    if (node.children.length === 0) return null;
    return node.children.reduce((best, child) =>
      ucb1Score(child, explorationParam) > ucb1Score(best, explorationParam) ? child : best
    );
  }

  /** Compute the depth of a node (root = depth 0). */
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
