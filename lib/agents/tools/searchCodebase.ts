import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { searchMemories } from "@/lib/memory/vectorStore";
import { logger } from "@/lib/logger";
import { CodeSearchMcts, CodeSearchState, AstLanguage } from "@/lib/ucol/mcts/codeSearchMcts";
import { serializeAstForJepa, detectLanguage } from "@/lib/jepa/astEncoderInput";
import { buildAstFromSource } from "@/lib/ucol/mcts/codeSearchMcts";
import { jepaCircuitBreaker } from "@/lib/jepa/circuitBreaker";

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
    .describe("When true, run a JEPA-backed MCTS over the first retrieved chunk to propose a refined candidate instead of returning raw semantic matches."),
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

        const initialState: CodeSearchState = {
          source,
          language,
          root: buildAstFromSource(source, language),
          astTokens,
          embedding: null,
          metadata: {
            path: chunk.metadata?.path,
            chunkType: chunk.metadata?.chunkType,
          },
        };

        const mcts = new CodeSearchMcts({ maxIterations: 8 });
        try {
          const best = await mcts.search(initialState, null);

          const summaryLines = best.summary.split('\n').filter((line: string) => line.trim().length > 0);
          const circuitState = jepaCircuitBreaker.getState();

          if (best.divergence >= 1 && circuitState === 'half-open') {
            // If MCTS itself reports max divergence on half-open, record failure
            // and continue returning fallback rather than pretending success.
            jepaCircuitBreaker.recordFailure(best.summary.includes('encoder-failed') ? 601 : 100);
          } else if (circuitState !== 'open') {
            jepaCircuitBreaker.recordSuccess();
          }

          return {
            success: true,
            data: {
              query: input.query,
              mode: 'mcts',
              usedMcts: true,
              bestState: {
                source: best.bestState.source,
                language: best.bestState.language,
                lastAction: best.bestState.metadata?.lastAction ?? best.bestAction?.description ?? null,
              },
              bestAction: best.bestAction,
              divergence: best.divergence,
              iterations: best.iterations,
              summary: summaryLines.join('\n'),
              circuitState,
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
        } catch (mctsError: any) {
          jepaCircuitBreaker.recordFailure(601);
          return {
            success: true,
            data: {
              query: input.query,
              mode: 'mcts',
              usedMcts: false,
              error: String(mctsError.message ?? mctsError),
              circuitState: jepaCircuitBreaker.getState(),
              message: 'MCTS search failed; using syntactic planning fallback.',
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
