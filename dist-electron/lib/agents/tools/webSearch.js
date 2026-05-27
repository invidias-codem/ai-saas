"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSearchTool = void 0;
const zod_1 = require("zod");
const logger_1 = require("@/lib/logger");
/**
 * Web Search Tool — Agentic Mode
 *
 * Wraps the existing researcher.ts performResearch() function as a
 * registerable Tool for the ReAct loop. Enables Claude (Agentic toggle)
 * to autonomously search the web and incorporate live results.
 */
const WebSearchInputSchema = zod_1.z.object({
    query: zod_1.z.string().describe("The search query to look up on the web"),
    maxResults: zod_1.z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe("Maximum number of search results to return (1-10)"),
});
exports.webSearchTool = {
    name: "web_search",
    description: "Search the live web for current information, news, research papers, documentation, or any topic. " +
        "Use this when you need up-to-date information that may not be in your training data. " +
        "Returns titles, URLs, and content snippets from search results.",
    schema: WebSearchInputSchema,
    risk: "read-only",
    requiresApproval: false,
    timeoutMs: 15000,
    async execute(input, _context) {
        try {
            const { performResearch } = await Promise.resolve().then(() => __importStar(require("@/lib/agents/researcher")));
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
                    results: results.map((r) => ({
                        title: r.title,
                        url: r.url,
                        snippet: r.content?.slice(0, 600) ?? "",
                    })),
                },
            };
        }
        catch (error) {
            logger_1.logger.error("[webSearchTool] Error", error);
            return { success: false, error: error.message ?? "Web search failed" };
        }
    },
};
