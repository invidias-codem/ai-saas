import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { searchMemories } from "@/lib/memory/vectorStore";
import { logger } from "@/lib/logger";

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
});

type SearchCodebaseInput = z.infer<typeof SearchCodebaseInputSchema>;

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

      // Format results cleanly to present logical boundaries and files
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
