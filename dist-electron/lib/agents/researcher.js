"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performResearch = performResearch;
exports.formatSearchResults = formatSearchResults;
const generative_ai_1 = require("@google/generative-ai");
const anyCrawl_1 = require("../integrations/anyCrawl");
const fallbackApis_1 = require("../integrations/fallbackApis");
const academic_1 = require("../integrations/academic");
const env_1 = require("@/lib/env");
// Initialize lazily
function getModel() {
    const genAI = new generative_ai_1.GoogleGenerativeAI((0, env_1.requireEnv)('GOOGLE_API_KEY'));
    return genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });
}
/**
 * Orchestrates the research process:
 * 1. Check for specialized APIs (crypto, weather, news, stocks)
 * 2. Metadata check: Does the query imply a need for current info?
 * 3. Query Formulation: Create effective search queries.
 * 4. Execution: Run search via AnyCrawl (if available).
 */
async function performResearch(userQuery, conversationContext = '', options) {
    console.log('[Researcher] Starting research for query:', userQuery.substring(0, 50));
    try {
        // 1. Check specialized APIs in order of priority
        // --- Crypto Prices (CoinGecko - no key needed) ---
        const cryptoCheck = (0, fallbackApis_1.isCryptoQuery)(userQuery);
        if (cryptoCheck.isCrypto && cryptoCheck.symbol) {
            console.log('[Researcher] Detected crypto query, using CoinGecko API');
            const price = await (0, fallbackApis_1.getCryptoPrice)(cryptoCheck.symbol);
            if (price) {
                return {
                    needsSearch: true,
                    queries: [`${cryptoCheck.symbol} price`],
                    results: [{
                            title: `${price.name} Price - Real-time`,
                            url: 'https://www.coingecko.com',
                            snippet: (0, fallbackApis_1.formatCryptoPriceAsSearchResult)(price)
                        }]
                };
            }
        }
        // --- Weather (OpenWeatherMap) ---
        const weatherCheck = (0, fallbackApis_1.isWeatherQuery)(userQuery);
        if (weatherCheck.isWeather && weatherCheck.city) {
            console.log('[Researcher] Detected weather query, using OpenWeatherMap API');
            const weather = await (0, fallbackApis_1.getWeather)(weatherCheck.city);
            if (weather) {
                return {
                    needsSearch: true,
                    queries: [`weather ${weatherCheck.city}`],
                    results: [{
                            title: `Weather in ${weather.city} - Real-time`,
                            url: 'https://openweathermap.org',
                            snippet: (0, fallbackApis_1.formatWeatherAsSearchResult)(weather)
                        }]
                };
            }
        }
        // --- News (NewsAPI) ---
        const newsCheck = (0, fallbackApis_1.isNewsQuery)(userQuery);
        if (newsCheck.isNews && newsCheck.topic) {
            console.log('[Researcher] Detected news query, using NewsAPI');
            const articles = await (0, fallbackApis_1.getNews)(newsCheck.topic, 3);
            if (articles.length > 0) {
                return {
                    needsSearch: true,
                    queries: [`news ${newsCheck.topic}`],
                    results: [{
                            title: `Latest News: ${newsCheck.topic}`,
                            url: 'https://newsapi.org',
                            snippet: (0, fallbackApis_1.formatNewsAsSearchResult)(articles)
                        }]
                };
            }
        }
        // --- Stocks (Alpha Vantage) ---
        const stockCheck = (0, fallbackApis_1.isStockQuery)(userQuery);
        if (stockCheck.isStock && stockCheck.symbol) {
            console.log('[Researcher] Detected stock query, using Alpha Vantage API');
            const quote = await (0, fallbackApis_1.getStockQuote)(stockCheck.symbol);
            if (quote) {
                return {
                    needsSearch: true,
                    queries: [`${stockCheck.symbol} stock price`],
                    results: [{
                            title: `${quote.symbol} Stock Price - Real-time`,
                            url: 'https://www.alphavantage.co',
                            snippet: (0, fallbackApis_1.formatStockAsSearchResult)(quote)
                        }]
                };
            }
        }
        // --- Academic Research (arXiv + Gemini Multimodal) ---
        const academicCheck = isAcademicQuery(userQuery);
        if (academicCheck.isAcademic && academicCheck.topic) {
            console.log('[Researcher] Detected academic query, checking arXiv...');
            const papers = await (0, academic_1.searchArxiv)(academicCheck.topic);
            if (papers.length > 0) {
                // Check if user wants deep analysis (multimodal)
                const wantsAnalysis = /analyze|explain|break down|deep dive|study/i.test(userQuery);
                if (wantsAnalysis) {
                    console.log('[Researcher] Performing deep multimodal analysis on top paper...');
                    const topPaper = papers[0];
                    const analysis = await (0, academic_1.analyzePaperWithGemini)(topPaper.pdfUrl, userQuery);
                    return {
                        needsSearch: true,
                        queries: [`analysis of ${topPaper.title}`],
                        results: [{
                                title: `Multimodal Analysis: ${topPaper.title}`,
                                url: topPaper.pdfUrl,
                                snippet: `## Deep Analysis (Gemini Vision)\n\n${analysis}\n\n### Source Abstract\n${topPaper.summary}`
                            }]
                    };
                }
                // Default: Return list of papers
                return {
                    needsSearch: true,
                    queries: [`arxiv ${academicCheck.topic}`],
                    results: papers.map(p => ({
                        title: `[Paper] ${p.title}`,
                        url: p.pdfUrl,
                        snippet: `**Published**: ${p.publishedAt}\n**Authors**: ${p.authors.join(', ')}\n\n${p.summary}`
                    }))
                };
            }
        }
        // 2. Decision Step - should we do a general web search?
        // If a file is attached, we bias heavily AGAINST searching unless explicitly asked to look external
        if (options?.hasFileAttachment) {
            console.log('[Researcher] File attached - modifying search probability');
            // Strict check: if the user asks to "analyze this file", do NOT search
            if (/analyze|explain|this file|attached|code/i.test(userQuery) && !/web|search|internet|lookup/i.test(userQuery)) {
                console.log('[Researcher] Skipping search - User wants file analysis');
                return { needsSearch: false, queries: [], results: [] };
            }
        }
        const needsSearch = await shouldSearch(userQuery);
        console.log('[Researcher] Needs search?', needsSearch);
        if (!needsSearch) {
            console.log('[Researcher] Skipping search - not needed');
            return { needsSearch: false, queries: [], results: [] };
        }
        // 3. Query Generation
        const queries = await generateSearchQueries(userQuery, conversationContext);
        // 4. Execution (web search fallback)
        const uniqueResults = [];
        const mainQuery = queries[0];
        if (mainQuery) {
            console.log(`[Researcher] Searching web for: "${mainQuery}"`);
            const results = await (0, anyCrawl_1.searchWeb)(mainQuery, 3);
            uniqueResults.push(...results);
        }
        return {
            needsSearch: true,
            queries,
            results: uniqueResults
        };
    }
    catch (error) {
        console.error('Research failed:', error);
        return { needsSearch: false, queries: [], results: [] };
    }
}
/**
 * Determines if the user's query requires external information.
 */
async function shouldSearch(query) {
    const prompt = `
    Analyze the following user query. Does it require looking up:
    1. Real-time information (news, weather, stock prices, sports scores)?
    2. Specific facts not likely in general training data (latest software docs, obscure events)?
    3. Content from a specific URL provided in the query?
    
    Query: "${query}"
    
    Respond with 'YES' or 'NO' only.
  `;
    try {
        const result = await getModel().generateContent(prompt);
        const response = result.response.text().trim().toUpperCase();
        console.log('[Researcher] shouldSearch LLM response:', response);
        return response.includes('YES');
    }
    catch (e) {
        console.error('[Researcher] shouldSearch error:', e);
        return false; // Fail safe
    }
}
/**
 * Generates specific search queries based on the user's intent.
 */
async function generateSearchQueries(query, context) {
    const prompt = `
    You are a search expert. Generate 1 Google search query to find the best information for the user's request.
    Optimize for finding facts and data.
    
    User Query: "${query}"
    Context: ${context.substring(0, 200)}...
    
    Output the query string only, no quotes, no explanation.
  `;
    try {
        const result = await getModel().generateContent(prompt);
        const searchQuery = result.response.text().trim();
        return [searchQuery];
    }
    catch (e) {
        return [query];
    }
}
/**
 * Format search results for the main prompt.
 */
function formatSearchResults(results) {
    if (results.length === 0)
        return '';
    let output = '\n## Web Search Results (Real-time Context)\n';
    results.forEach((res, index) => {
        output += `### Result ${index + 1}: ${res.title}\n`;
        output += `URL: ${res.url}\n`;
        output += `Snippet: ${res.snippet}\n\n`;
    });
    output += '\nCRITICAL INSTRUCTION: You have been provided with real-time live internet search results above. Do NOT claim that you cannot browse the internet, do not say you lack real-time access, and do not refuse to answer. A background system has already performed the internet search for you. Synthesize the provided search results to answer the user directly and confidently.\n';
    return output;
}
/**
 * Detects if a query is academic/research focused.
 */
function isAcademicQuery(query) {
    // ReDoS guard: cap input length before regex evaluation
    if (query.length > 500) {
        return { isAcademic: false, topic: null };
    }
    const academicPatterns = [
        /(?:latest\s+)?research\s+(?:papers?|about|on|for)\s+(.{1,400})/i,
        /(?:find|search|show)\s+(?:arxiv|scholar|academic)\s+(?:papers?\s+)?(?:about|on)\s+(.{1,400})/i,
        /analysis\s+of\s+(?:the\s+)?paper\s+(.{1,400})/i,
        /study\s+(?:about|on)\s+(.{1,400})/i
    ];
    for (const pattern of academicPatterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            // Clean up topic: remove leading prepositions and trailing punctuation
            const cleanTopic = match[1].trim().replace(/^(on|about|for|in)\s+/i, '').replace(/[?!.]+$/, '');
            return { isAcademic: true, topic: cleanTopic };
        }
    }
    // Fallback: Check for specific keywords
    if (/arxiv|scholar|research paper|bibliography/i.test(query)) {
        // Simple extraction: remove keywords
        const topic = query.replace(/arxiv|scholar|research paper|bibliography|find|search|show|me/gi, '').trim();
        return { isAcademic: true, topic };
    }
    return { isAcademic: false, topic: null };
}
