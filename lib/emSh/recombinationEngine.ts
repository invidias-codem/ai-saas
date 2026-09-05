// lib/emSh/recombinationEngine.ts
// EMSH Strategy Synthesis — compiles high-fitness genotypes into a reusable
// "Operating Strategy" prompt module, and performs genetic crossover across
// matched genotypes to yield compounding cross-session intelligence.
//
// Matching strategy (cold-start safe):
//   * Canonical intent signature is derived from the normalized query (NOT the
//     raw user string) so semantically-equivalent prompts cluster together.
//   * Retrieval uses `findGenotypesBySignature` (exact-cluster recall, keyed on
//     the `intent_signature` column), then gates on fitness.
//
// IMPORTANT — embedding dimension mismatch: `generateEmbedding()` produces
// 3072-dim vectors (gemini-embedding-2-preview), but `genotypes.intent_embedding`
// is `vector(768)`. Cosine similarity across the two is therefore NOT safe yet;
// until the genotype embedding lane is migrated to 3072 (or a 768-dim embedder is
// wired in), matching is signature- + fitness-based only. Do NOT compare the live
// query embedding against stored 768-dim vectors — it will silently produce
// garbage cosine scores.

import type { GenotypeRecord, GenotypeDAG, GenotypeNode, GenotypeEdge } from './types';
import { findHighFitnessGenotypes, findGenotypesBySignature } from './genotypeStore';

/** Minimum fitness (0..1) for a genotype to contribute to a strategy. */
export const STRATEGY_FITNESS_THRESHOLD = 0.85;

/** How many top genotypes to synthesize (crossover pool size). */
export const CROSSOVER_POOL_SIZE = 5;

export interface OperatingStrategy {
  /** Canonical intent signature this strategy targets. */
  intentSignature: string;
  /** Human-readable strategy block (injected into the system context). */
  prompt: string;
  /** Ordered abstract steps (unified from the crossover pool). */
  steps: string[];
  /** Tool names referenced by the strategy (in dependency order). */
  tools: string[];
  /** Best fitness seen across the contributing genotypes. */
  confidence: number;
  /** Ids of the genotypes that contributed to this synthesis. */
  sourceGenotypeIds: string[];
  /** True when this was synthesized from >=2 genotypes (crossover), else single-parent. */
  crossover: boolean;
}

/**
 * Derive a deterministic, normalization-stable intent signature from a query,
 * so equivalent prompts collapse to the same key without needing embeddings.
 */
export function deriveIntentSignature(query: string): string {
  const stop = new Set([
    'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'with',
    'please', 'can', 'you', 'could', 'would', 'should', 'me', 'my', 'what', 'how',
    'is', 'are', 'was', 'were', 'do', 'does', 'did', 'it', 'this', 'that', 'i',
  ]);
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stop.has(t));
  // Sorted tokens → order-independent signature → robust to prompt rephrasing.
  return tokens.sort().join(' ');
}

/**
 * Synthesize an Operating Strategy from the top high-fitness genotypes matching
 * the query's intent. Returns null on cold-start (no genotype exceeds the
 * threshold), which callers must handle by simply omitting the strategy block.
 */
export async function synthesizeStrategy(params: {
  userQuery: string;
  workspaceId?: string | null;
  intentSignature?: string;
  fitnessThreshold?: number;
  crossoverPoolSize?: number;
}): Promise<OperatingStrategy | null> {
  const {
    userQuery,
    workspaceId = null,
    intentSignature,
    fitnessThreshold = STRATEGY_FITNESS_THRESHOLD,
    crossoverPoolSize = CROSSOVER_POOL_SIZE,
  } = params;

  const signature = intentSignature ?? deriveIntentSignature(userQuery);
  if (!signature) return null;

  let candidates: GenotypeRecord[] = [];

  // 1. Exact-cluster recall (signature match) — the primary, mismatch-safe path.
  const exactMatches = await findGenotypesBySignature(signature, crossoverPoolSize);

  // 2. Broaden to workspace-wide high-fitness genotypes when the exact cluster
  //    is thin — enables cross-intent recombination within the same workspace.
  const broadMatches = await findHighFitnessGenotypes(null, {
    workspaceId,
    limit: crossoverPoolSize,
    minFitness: fitnessThreshold,
  });

  // Dedupe by id, preserving exact-cluster results first.
  const seen = new Set<string>();
  for (const g of [...exactMatches, ...broadMatches]) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    candidates.push(g);
  }

  // Filter to only above-threshold genotypes (exact matches may still be low-fitness).
  const eligible = candidates
    .filter((g) => g.fitnessScore >= fitnessThreshold)
    .slice(0, crossoverPoolSize);

  if (eligible.length === 0) return null; // cold-start: no confident meta-skill yet

  const steps: string[] = [];
  const tools: string[] = [];
  const sources: string[] = [];
  let bestFitness = 0;

  for (const g of eligible) {
    bestFitness = Math.max(bestFitness, g.fitnessScore);
    sources.push(g.id);
    collectSteps(g.abstractDag, steps, tools);
  }

  // Dedupe while preserving order.
  const uniqueSteps = Array.from(new Set(steps));
  const uniqueTools = Array.from(new Set(tools));

  const confidence = bestFitness;
  const crossover = eligible.length >= 2;

  const prompt = renderStrategyPrompt({
    signature,
    steps: uniqueSteps,
    tools: uniqueTools,
    confidence,
    crossover,
    sourceCount: eligible.length,
  });

  return {
    intentSignature: signature,
    prompt,
    steps: uniqueSteps,
    tools: uniqueTools,
    confidence,
    sourceGenotypeIds: sources,
    crossover,
  };
}

/** Extract ordered human-readable steps + tool names from a genotype DAG. */
function collectSteps(dag: GenotypeDAG, steps: string[], tools: string[]): void {
  const nodeById = new Map<string, GenotypeNode>();
  for (const n of dag.nodes) nodeById.set(n.id, n);

  // Ordered linearization: follow edges from source nodes; fall back to node order.
  const order = topologicalOrder(dag.nodes, dag.edges);
  for (const node of order) {
    if (node.stepType === 'TOOL' || node.toolName) {
      const tool = node.toolName || node.id;
      if (tool) tools.push(tool);
      steps.push(`invoke ${tool}`);
    } else if (node.stepType === 'TOOL_RESULT') {
      continue; // results don't add a step; the invocation implies them
    } else {
      const verb = node.stepType === 'AGENT' ? 'act' : node.stepType === 'USER' ? 'clarify' : 'setup';
      steps.push(`${verb}: ${node.id}`);
    }
  }
}

/** Deterministic topological order (Kahn's algorithm), stable fallback to node order. */
function topologicalOrder(nodes: GenotypeNode[], edges: GenotypeEdge[]): GenotypeNode[] {
  const byId = new Map<string, GenotypeNode>(nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const e of edges) {
    if (!byId.has(e.fromStep) || !byId.has(e.toStep)) continue;
    adj.get(e.fromStep)!.push(e.toStep);
    indegree.set(e.toStep, (indegree.get(e.toStep) ?? 0) + 1);
  }

  const queue = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const result: GenotypeNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(byId.get(id)!);
    for (const next of adj.get(id) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  // Append any nodes not reached (cycles / dangling edges) in original order.
  if (result.length < nodes.length) {
    const seen = new Set(result.map((n) => n.id));
    for (const n of nodes) if (!seen.has(n.id)) result.push(n);
  }
  return result;
}

function renderStrategyPrompt(p: {
  signature: string;
  steps: string[];
  tools: string[];
  confidence: number;
  crossover: boolean;
  sourceCount: number;
}): string {
  const lines: string[] = [];
  lines.push('## Operating Strategy (learned meta-skill)');
  lines.push(`Intent: ${p.signature}`);
  lines.push(`Confidence: ${(p.confidence * 100).toFixed(0)}% — synthesized from ${p.sourceCount} high-fitness execution${p.sourceCount > 1 ? 's' : ''}${p.crossover ? ' (genetic crossover)' : ''}`);
  if (p.steps.length > 0) {
    lines.push('');
    lines.push('Recommended execution sequence:');
    p.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }
  if (p.tools.length > 0) {
    lines.push('');
    lines.push(`Prefer these tools: ${p.tools.join(', ')}`);
  }
  return lines.join('\n');
}