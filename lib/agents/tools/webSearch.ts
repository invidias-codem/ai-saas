import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { logger } from "@/lib/logger";

/**
 * Web Search Tool — Agentic Mode
 *
 * Wraps the existing researcher.ts performResearch() function as a
 * registerable Tool for the ReAct loop. Enables Claude (Agentic toggle)
 * to autonomously search the web and incorporate live results.
 */

const WebSearchInputSchema = z.object({
  query: z.string().describe("The search query to look up on the web"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of search results to return (1-10)"),
});

type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the live web for current information, news, research papers, documentation, or any topic. " +
    "Use this when you need up-to-date information that may not be in your training data. " +
    "Returns titles, URLs, and content snippets from search results.",
  schema: WebSearchInputSchema,
  risk: "read-only",
  requiresApproval: false,
  timeoutMs: 15000,

  async execute(input: WebSearchInput, _context: AgentContext): Promise<ToolResult> {
    try {
      const { performResearch } = await import("@/lib/agents/researcher");
      const result = await performResearch(input.query);

      const results = result.results.slice(0, input.maxResults ?? 5);

      if (!results.length) {
        return {
          success: true,
          data: { query: input.query, results: [], message: "No results found." },
        };
      }

      return {
        success: true,
        data: {
          query: input.query,
          results: results.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 600) ?? "",
          })),
        },
      };
    } catch (error: any) {
      logger.error("[webSearchTool] Error", error);
      return { success: false, error: error.message ?? "Web search failed" };
    }
  },
};
