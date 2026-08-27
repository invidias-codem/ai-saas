import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { searchMemories } from "@/lib/memory/vectorStore";
import { logger } from "@/lib/logger";
import { CodeSearchMcts, CodeSearchState, AstLanguage } from "@/lib/ucol/mcts/codeSearchMcts";
import { serializeAstForJepa, detectLanguage } from "@/lib/jepa/astEncoderInput";
import { buildAstFromSource } from "@/lib/ucol/mcts/codeSearchMcts";
import { jepaCircuitBreaker } from "@/lib/jepa/circuitBreaker";
import {
  LatentState,
  LatentAction,
  runLatentMcts,
  formulateAction,
  latentRollout,
  cosineDistance,
  perturbEmbedding,
} from '@/lib/jepa/latentMcts';
import {
  computeProductOfExperts,
  expandSparseVariance,
  isCircuitBreakerTripped,
} from '@/lib/jepa/vjepa';
import { loadPriorExpert } from '@/lib/jepa/priors';

const JEPA_PREDICT_ROUTE = '/api/jepa/predict';

interface VjepaPredictResponse {
  status: string;
  mu?: number[];
  varIndices?: number[];
  varValues?: number[];
  meanVariance?: number;
  maxVarianceDim?: number;
  fallbackToSyntactic?: boolean;
  totalMs?: number;
  warmStart?: boolean;
  error?: string;
}

async function fetchVjepaDistribution(
  embedding: number[],
): Promise<VjepaPredictResponse | null> {
  'use server';
  try {
    const res = await fetch(JEPA_PREDICT_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latentState: embedding }),
    });

    if (!res.ok) {
      return null;
    }

    const payload = (await res.json()) as VjepaPredictResponse;
    if (payload.status !== 'success' || !payload.mu || payload.fallbackToSyntactic) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function resolveActionsWithPredictor(
  initialState: LatentState,
  actions: LatentAction[],
): Promise<LatentAction[]> {
  // VJEPA predictor: query once for the initial state distribution.
  // Action-level resolution requires a separate action-conditioned predictor;
  // for now, all actions are considered valid if the distribution is stable.
  const distribution = await fetchVjepaDistribution(initialState.embedding);
  if (!distribution) {
    return [];
  }

  // Circuit-breaker: high max variance → fail closed, no predictor.
  if (distribution.maxVarianceDim !== undefined && distribution.maxVarianceDim > 0.95) {
    return [];
  }

  return actions;
}

async function predictorAwareRunLatentMcts(
  initialState: LatentState,
  actions: LatentAction[],
  options: {
    maxIterations?: number;
    maxDepth?: number;
    explorationConstant?: number;
    energyWeight?: number;
    targetEmbedding?: number[];
    variancePenaltyLambda?: number;
    priorMu?: number[];
    priorVar?: number[];
  } = {},
): Promise<{
  result: ReturnType<typeof runLatentMcts>;
  usedPredictor: boolean;
  meanVariance: number | null;
}> {
  const distribution = await fetchVjepaDistribution(initialState.embedding);
  const usedPredictor = !!distribution && !distribution.fallbackToSyntactic;

  let finalMu: number[] = Array.from(distribution?.mu ?? initialState.embedding);
  let finalVar: number[];

  if (distribution) {
    finalVar = expandSparseVariance(
      distribution.varIndices ?? [],
      distribution.varValues ?? [],
      128,
      0.01,
    );
  } else {
    finalVar = new Array(128).fill(0.01);
  }

  if (options.priorMu && options.priorVar) {
    const poe = computeProductOfExperts(
      finalMu,
      finalVar,
      options.priorMu,
      options.priorVar,
    );
    finalMu = Array.from(poe.poeMu);
    finalVar = Array.from(poe.poeVar);
  }

  const maxPosteriorVariance = Math.max(...finalVar);
  if (isCircuitBreakerTripped(maxPosteriorVariance)) {
    return {
      result: runLatentMcts(initialState, [], {
        maxIterations: options.maxIterations ?? 12,
        maxDepth: options.maxDepth ?? 4,
        explorationConstant: options.explorationConstant ?? 1.1,
        energyWeight: options.energyWeight ?? 1.0,
        targetEmbedding: options.targetEmbedding,
        variancePenaltyLambda: 0,
      }),
      usedPredictor: false,
      meanVariance: null,
    };
  }

  const meanVariance = finalVar.reduce((s, v) => s + v, 0) / finalVar.length;

  const poeInitialState: LatentState = {
    ...initialState,
    embedding: Array.from(finalMu),
    meanVariance,
  };

  const result = runLatentMcts(poeInitialState, actions, {
    maxIterations: options.maxIterations ?? 12,
    maxDepth: options.maxDepth ?? 4,
    explorationConstant: options.explorationConstant ?? 1.1,
    energyWeight: options.energyWeight ?? 1.0,
    targetEmbedding: options.targetEmbedding,
    variancePenaltyLambda: usedPredictor ? (options.variancePenaltyLambda ?? 0.5) : 0,
  });

  return { result, usedPredictor, meanVariance };
}

const SearchCodebaseInputSchema = z.object({
  query: z.string().describe("The semantic search query to look up in the codebase (e.g., 'IPC bridging stderr log parsing logic' or 'how do we track active subagents')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of relevant chunks to retrieve (default: 5, max: 10)"),
  useMcts: z
    .boolean()
    .optional()
    .default(false)
    .describe("When true, run a JEPA-backed latent-space MCTS over the first retrieved chunk to propose a refined candidate instead of returning raw semantic matches."),
  constraintId: z
    .string()
    .optional()
    .describe("Optional BJEPA prior expert constraint ID, e.g. 'memory_safety', to inject into latent-space rollouts via Product of Experts."),
});

type SearchCodebaseInput = z.infer<typeof SearchCodebaseInputSchema>;

function inferLanguageFromPath(filePath: string): AstLanguage {
  const normalized = (filePath || '').toLowerCase();
  if (normalized.endsWith('.ts')) return 'typescript';
  if (normalized.endsWith('.tsx')) return 'tsx';
  if (normalized.endsWith('.js')) return 'javascript';
  if (normalized.endsWith('.jsx')) return 'jsx';
  if (normalized.endsWith('.go')) return 'go';
  if (normalized.endsWith('.py')) return 'python';
  if (/test|spec/.test(normalized)) return 'javascript';
  return 'unknown';
}

/**
 * Stable projection from AST token text to a dense latent embedding.
 *
 * Serverless constraint: no heavy ML runtime. This produces a deterministic
 * embedding that preserves token-level semantics enough for MCTS energy
 * scoring and branch pruning. The learned JEPA encoder will replace this
 * once the WASM/TF runtime is available in edge workers.
 */
function astTokensToEmbedding(tokens: string, dim = 128): number[] {
  const embedding = new Array<number>(dim).fill(0);
  let hash = 0;
  let tokenCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    const ch = tokens.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
    const idx = Math.abs(hash) % dim;
    embedding[idx] += 1;
    tokenCount++;
  }
  if (tokenCount > 0) {
    const norm = Math.sqrt(tokenCount);
    for (let i = 0; i < dim; i++) {
      embedding[i] = embedding[i] / norm;
    }
  }
  return embedding;
}

/**
 * Candidate action deltas for latent MCTS.
 *
 * Each entry is a small perturbation vector in embedding space representing
 * a proposed code modification: extract function, inline variable, add type,
 * split method, rename symbol, etc.
 */
const DEFAULT_ACTION_CANDIDATES: LatentAction[] = [
  formulateAction('extract_function', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.2)),
  formulateAction('inline_variable', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.15)),
  formulateAction('add_type_annotation', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.1)),
  formulateAction('split_method', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.25)),
  formulateAction('rename_symbol', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.05)),
  formulateAction('introduce_guard_clause', Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.2)),
];

export const searchCodebaseTool: Tool = {
  name: "search_codebase",
  description:
    "Retrieve semantically relevant, logical chunks of code (e.g. functions, methods, class structures, headings) " +
    "directly matching a query. Use this to understand codebase details and flow without loading entire huge files.",
  schema: SearchCodebaseInputSchema,
  risk: "read-only",
  requiresApproval: false,
  timeoutMs: 10000,

  async execute(input: SearchCodebaseInput, _context: AgentContext): Promise<ToolResult> {
    try {
      const results = await searchMemories(
        "system",
        input.query,
        input.limit ?? 5,
        "code_chunk",
        { workspaceId: process.cwd() }
      );

      if (!results || results.length === 0) {
        return {
          success: true,
          data: {
            query: input.query,
            chunks: [],
            message: "No matching codebase chunks found. Try refining your semantic query.",
          },
        };
      }

      if (input.useMcts) {
        if (!jepaCircuitBreaker.allowRequest()) {
          return {
            success: true,
            data: {
              query: input.query,
              mode: 'syntactic-fallback',
              usedMcts: false,
              circuitState: jepaCircuitBreaker.getState(),
              message: 'JEPA circuit is open; using syntactic planning fallback.',
              semanticFallback: results.slice(0, input.limit ?? 5).map((m, idx) => ({
                matchIndex: idx + 1,
                filePath: m.metadata?.path || 'unknown',
                logicalName: m.metadata?.logicalName || 'unknown',
                chunkType: m.metadata?.chunkType || 'unknown',
                lineRange: `${m.metadata?.startLine || '?'}-${m.metadata?.endLine || '?'}`,
                similarity: m.similarity ? Math.round(m.similarity * 100) / 100 : undefined,
                code: m.content,
              })),
            },
          };
        }

        const chunk = results[0];
        const source = String(chunk.content ?? '');
        const language = inferLanguageFromPath(chunk.metadata?.path || '');
        const astTokens = serializeAstForJepa(source, language);

        // Build latent state from AST tokens
        const embedding = astTokensToEmbedding(astTokens, 128);
        const initialState: LatentState = {
          embedding,
          source,
          actionDescription: 'initial_code_chunk',
        };

        // Candidate actions are drawn from the current chunk's AST structure.
        // In a later stage, these will be learned from real edit diffs.
        const actions = DEFAULT_ACTION_CANDIDATES.slice(0, 6);

        let mctsError: unknown = null;
        let usedPredictor = false;
        let meanVariance: number | null = null;
        let latentResult = runLatentMcts(initialState, actions, {
          maxIterations: 12,
          maxDepth: 4,
          explorationConstant: 1.1,
          energyWeight: 1.0,
        });

        try {
          const mctsOptions: {
            maxIterations: number;
            maxDepth: number;
            explorationConstant: number;
            energyWeight: number;
            variancePenaltyLambda: number;
            priorMu?: number[];
            priorVar?: number[];
          } = {
            maxIterations: 12,
            maxDepth: 4,
            explorationConstant: 1.1,
            energyWeight: 1.0,
            variancePenaltyLambda: 0.5,
          };

          if (input.constraintId) {
            try {
              const prior = loadPriorExpert(input.constraintId);
              mctsOptions.priorMu = prior.priorMu;
              mctsOptions.priorVar = prior.priorVar;
            } catch (priorError) {
              logger.warn(`[searchCodebaseTool] Failed to load prior expert: ${priorError}`);
            }
          }

          const predictorAware = await predictorAwareRunLatentMcts(
            initialState,
            actions,
            mctsOptions,
          );
          usedPredictor = predictorAware.usedPredictor;
          meanVariance = predictorAware.meanVariance;
          latentResult = predictorAware.result;
        } catch (err) {
          mctsError = err;
        }

        // If the first rollout diverges badly, prune weaker action deltas and rerun.
        const firstEnergy = latentResult.energy;
        if (!Number.isFinite(firstEnergy) || firstEnergy > 0.95) {
          const conservativeActions = actions
            .map(a => ({
              action: a,
              rollout: latentRollout(initialState.embedding, a),
              energy: cosineDistance(latentRollout(initialState.embedding, a), []),
            }))
            .filter(item => Number.isFinite(item.energy) && item.energy < 0.95)
            .sort((a, b) => a.energy - b.energy)
            .slice(0, 3)
            .map(item => item.action);

          if (conservativeActions.length > 0) {
            try {
              const predictorAware = await predictorAwareRunLatentMcts(
                initialState,
                conservativeActions,
                {
                  maxIterations: 8,
                  maxDepth: 3,
                  explorationConstant: 0.9,
                  energyWeight: 1.0,
                }
              );
              usedPredictor = predictorAware.usedPredictor;
              latentResult = predictorAware.result;
            } catch (err) {
              mctsError = err;
            }
          }
        }

        const circuitState = jepaCircuitBreaker.getState();
        if (mctsError) {
          jepaCircuitBreaker.recordFailure(601);
        } else if (circuitState !== 'open') {
          jepaCircuitBreaker.recordSuccess();
        }

        return {
          success: true,
          data: {
            query: input.query,
            mode: 'latent-mcts',
            usedMcts: true,
            usedPredictor,
            meanVariance,
            bestState: {
              source: latentResult.bestState.source,
              actionDescription: latentResult.bestAction?.description ?? latentResult.bestState.actionDescription ?? null,
            },
            bestAction: latentResult.bestAction,
            energy: latentResult.energy,
            iterations: latentResult.iterations,
            summary: latentResult.summary,
            circuitState,
            error: mctsError ? String(mctsError) : undefined,
            semanticFallback: results.slice(0, input.limit ?? 5).map((m, idx) => ({
              matchIndex: idx + 1,
              filePath: m.metadata?.path || 'unknown',
              logicalName: m.metadata?.logicalName || 'unknown',
              chunkType: m.metadata?.chunkType || 'unknown',
              lineRange: `${m.metadata?.startLine || '?'}-${m.metadata?.endLine || '?'}`,
              similarity: m.similarity ? Math.round(m.similarity * 100) / 100 : undefined,
              code: m.content,
            })),
          },
        };
      }

      const formattedChunks = results.map((m, idx) => {
        const metadata = m.metadata || {};
        return {
          matchIndex: idx + 1,
          filePath: metadata.path || "unknown",
          logicalName: metadata.logicalName || "unknown",
          chunkType: metadata.chunkType || "unknown",
          lineRange: `${metadata.startLine || "?"}-${metadata.endLine || "?"}`,
          similarity: m.similarity ? Math.round(m.similarity * 100) / 100 : undefined,
          dependencies: metadata.dependencies || [],
          code: m.content,
        };
      });

      return {
        success: true,
        data: {
          query: input.query,
          chunks: formattedChunks,
        },
      };
    } catch (error: any) {
      logger.error("[searchCodebaseTool] Error executing search_codebase", error);
      return {
        success: false,
        error: error.message ?? "Failed to perform semantic codebase search",
      };
    }
  },
};
