"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchTavily = searchTavily;
const axios_1 = __importDefault(require("axios"));
const TAVILY_API_URL = 'https://api.tavily.com/search';
/**
 * Perform a search using Tavily API.
 * Optimized for LLM contexts (returns clean content).
 */
async function searchTavily(query, options = {}) {
    // Read key at runtime to allow for dotenv loading
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.warn("[Tavily] No API Key provided. Returning empty results.");
        return { query, results: [] };
    }
    try {
        console.log(`[Tavily] Searching for: "${query}"`);
        const response = await axios_1.default.post(TAVILY_API_URL, {
            api_key: apiKey,
            query: query,
            search_depth: options.search_depth || 'basic',
            include_answer: true,
            include_raw_content: options.include_raw_content || false,
            max_results: options.max_results || 5
        });
        // Normalize response
        // Tavily returns { results: [], answer: "", ... }
        return response.data;
    }
    catch (error) {
        console.error("[Tavily] Search failed:", error?.response?.data || error.message);
        // Do not throw, return empty to be resilient
        return { query, results: [] };
    }
}
