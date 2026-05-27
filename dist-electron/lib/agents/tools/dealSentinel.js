"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dealSentinelTool = void 0;
const zod_1 = require("zod");
const tavilySearch_1 = require("../../integrations/tavilySearch");
// Input Schema
const InputSchema = zod_1.z.object({
    documentText: zod_1.z.string().describe("The raw text content or OCR output of the quote, bill, or contract."),
    category: zod_1.z.enum(['automotive', 'medical', 'saas', 'real_estate', 'contractor', 'other'])
        .describe("The industry category of the document."),
    userGoal: zod_1.z.string().describe("The user's objective, e.g., 'Lower the price', 'Check for fraud', 'Audit line items'."),
    location: zod_1.z.string().optional().describe("Zip code or city for local labor rate benchmarking.")
});
/**
 * The Deal Sentinel Tool
 * Analyzes financial documents, benchmarks against web data, and drafts negotiation strategies.
 */
exports.dealSentinelTool = {
    name: "analyze_and_negotiate_quote",
    description: "Analyzes a financial quote or contract. Performs market research to find fair prices and returns raw data to help the agent draft a negotiation strategy.",
    schema: InputSchema,
    risk: 'analysis',
    timeoutMs: 60000,
    execute: async (input, context) => {
        const { documentText, category, userGoal, location } = input;
        console.log(`[DealSentinel] Analyzing ${category} quote. Goal: ${userGoal}`);
        // Strategy: Search for the concept + price + location
        // We construct a targeted search query.
        let searchQuery = `${documentText} cost price fair market value ${location || ""}`;
        if (category === 'automotive')
            searchQuery += " repair estimate";
        if (category === 'medical')
            searchQuery += " cpt code medicare rate";
        if (category === 'saas')
            searchQuery += " pricing per seat";
        // Trim 
        searchQuery = searchQuery.substring(0, 300);
        // 2. SEARCH: Get Market Data via Tavily
        const searchResult = await (0, tavilySearch_1.searchTavily)(searchQuery, {
            search_depth: 'advanced',
            max_results: 4
        });
        const sources = searchResult.results.map(r => ({
            title: r.title,
            url: r.url
        }));
        const marketContext = searchResult.results.map(r => `-- SOURCE: ${r.title} --\n${r.content}`).join('\n\n');
        // 3. RETURN: We return the raw intelligence. 
        // The Main Agent (ReAct) is responsible for the final "Drafting" step based on this observation.
        return {
            market_data_summary: marketContext,
            sources: sources,
            instruction_to_agent: `I have gathered market data for '${documentText}'. Compare the user's quote against the data above. Calculate the variance. If the quote is high, draft a negotiation script referencing these specific sources.`
        };
    }
};
