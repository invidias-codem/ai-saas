
import { GoogleGenerativeAI } from "@google/generative-ai";
import { searchWeb, SearchResult } from '../integrations/anyCrawl';
import {
    isCryptoQuery, getCryptoPrice, formatCryptoPriceAsSearchResult,
    isWeatherQuery, getWeather, formatWeatherAsSearchResult,
    isNewsQuery, getNews, formatNewsAsSearchResult,
    isStockQuery, getStockQuote, formatStockAsSearchResult
} from '../integrations/fallbackApis';
import { searchArxiv, analyzePaperWithGemini } from '../integrations/academic';
import { requireEnv } from '@/lib/env';

// Initialize a lightweight model for decision making
const genAI = new GoogleGenerativeAI(requireEnv('GOOGLE_API_KEY'));
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

interface ResearchResult {
    needsSearch: boolean;
    queries: string[];
    results: SearchResult[];
}

/**
 * Orchestrates the research process:
 * 1. Check for specialized APIs (crypto, weather, news, stocks)
 * 2. Metadata check: Does the query imply a need for current info?
 * 3. Query Formulation: Create effective search queries.
 * 4. Execution: Run search via AnyCrawl (if available).
 */
export async function performResearch(userQuery: string, conversationContext: string = ''): Promise<ResearchResult> {
    console.log('[Researcher] Starting research for query:', userQuery.substring(0, 50));
    try {
        // 1. Check specialized APIs in order of priority

        // --- Crypto Prices (CoinGecko - no key needed) ---
        const cryptoCheck = isCryptoQuery(userQuery);
        if (cryptoCheck.isCrypto && cryptoCheck.symbol) {
            console.log('[Researcher] Detected crypto query, using CoinGecko API');
            const price = await getCryptoPrice(cryptoCheck.symbol);
            if (price) {
                return {
                    needsSearch: true,
                    queries: [`${cryptoCheck.symbol} price`],
                    results: [{
                        title: `${price.name} Price - Real-time`,
                        url: 'https://www.coingecko.com',
                        snippet: formatCryptoPriceAsSearchResult(price)
                    }]
                };
            }
        }

        // --- Weather (OpenWeatherMap) ---
        const weatherCheck = isWeatherQuery(userQuery);
        if (weatherCheck.isWeather && weatherCheck.city) {
            console.log('[Researcher] Detected weather query, using OpenWeatherMap API');
            const weather = await getWeather(weatherCheck.city);
            if (weather) {
                return {
                    needsSearch: true,
                    queries: [`weather ${weatherCheck.city}`],
                    results: [{
                        title: `Weather in ${weather.city} - Real-time`,
                        url: 'https://openweathermap.org',
                        snippet: formatWeatherAsSearchResult(weather)
                    }]
                };
            }
        }

        // --- News (NewsAPI) ---
        const newsCheck = isNewsQuery(userQuery);
        if (newsCheck.isNews && newsCheck.topic) {
            console.log('[Researcher] Detected news query, using NewsAPI');
            const articles = await getNews(newsCheck.topic, 3);
            if (articles.length > 0) {
                return {
                    needsSearch: true,
                    queries: [`news ${newsCheck.topic}`],
                    results: [{
                        title: `Latest News: ${newsCheck.topic}`,
                        url: 'https://newsapi.org',
                        snippet: formatNewsAsSearchResult(articles)
                    }]
                };
            }
        }

        // --- Stocks (Alpha Vantage) ---
        const stockCheck = isStockQuery(userQuery);
        if (stockCheck.isStock && stockCheck.symbol) {
            console.log('[Researcher] Detected stock query, using Alpha Vantage API');
            const quote = await getStockQuote(stockCheck.symbol);
            if (quote) {
                return {
                    needsSearch: true,
                    queries: [`${stockCheck.symbol} stock price`],
                    results: [{
                        title: `${quote.symbol} Stock Price - Real-time`,
                        url: 'https://www.alphavantage.co',
                        snippet: formatStockAsSearchResult(quote)
                    }]
                };
            }
        }

        // --- Academic Research (arXiv + Gemini Multimodal) ---
        const academicCheck = isAcademicQuery(userQuery);
        if (academicCheck.isAcademic && academicCheck.topic) {
            console.log('[Researcher] Detected academic query, checking arXiv...');
            const papers = await searchArxiv(academicCheck.topic);

            if (papers.length > 0) {
                // Check if user wants deep analysis (multimodal)
                const wantsAnalysis = /analyze|explain|break down|deep dive|study/i.test(userQuery);

                if (wantsAnalysis) {
                    console.log('[Researcher] Performing deep multimodal analysis on top paper...');
                    const topPaper = papers[0];
                    const analysis = await analyzePaperWithGemini(topPaper.pdfUrl, userQuery);
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
        const needsSearch = await shouldSearch(userQuery);
        console.log('[Researcher] Needs search?', needsSearch);

        if (!needsSearch) {
            console.log('[Researcher] Skipping search - not needed');
            return { needsSearch: false, queries: [], results: [] };
        }

        // 3. Query Generation
        const queries = await generateSearchQueries(userQuery, conversationContext);

        // 4. Execution (web search fallback)
        const uniqueResults: SearchResult[] = [];
        const mainQuery = queries[0];

        if (mainQuery) {
            console.log(`[Researcher] Searching web for: "${mainQuery}"`);
            const results = await searchWeb(mainQuery, 3);
            uniqueResults.push(...results);
        }

        return {
            needsSearch: true,
            queries,
            results: uniqueResults
        };

    } catch (error) {
        console.error('Research failed:', error);
        return { needsSearch: false, queries: [], results: [] };
    }
}

/**
 * Determines if the user's query requires external information.
 */
async function shouldSearch(query: string): Promise<boolean> {
    const prompt = `
    Analyze the following user query. Does it require looking up:
    1. Real-time information (news, weather, stock prices, sports scores)?
    2. Specific facts not likely in general training data (latest software docs, obscure events)?
    3. Content from a specific URL provided in the query?
    
    Query: "${query}"
    
    Respond with 'YES' or 'NO' only.
  `;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim().toUpperCase();
        console.log('[Researcher] shouldSearch LLM response:', response);
        return response.includes('YES');
    } catch (e) {
        console.error('[Researcher] shouldSearch error:', e);
        return false; // Fail safe
    }
}

/**
 * Generates specific search queries based on the user's intent.
 */
async function generateSearchQueries(query: string, context: string): Promise<string[]> {
    const prompt = `
    You are a search expert. Generate 1 Google search query to find the best information for the user's request.
    Optimize for finding facts and data.
    
    User Query: "${query}"
    Context: ${context.substring(0, 200)}...
    
    Output the query string only, no quotes, no explanation.
  `;

    try {
        const result = await model.generateContent(prompt);
        const searchQuery = result.response.text().trim();
        return [searchQuery];
    } catch (e) {
        return [query];
    }
}

/**
 * Format search results for the main prompt.
 */
export function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) return '';

    let output = '\n## Web Search Results (Real-time Context)\n';

    results.forEach((res, index) => {
        output += `### Result ${index + 1}: ${res.title}\n`;
        output += `URL: ${res.url}\n`;
        output += `Snippet: ${res.snippet}\n\n`;
    });

    output += 'Use the above search results to provide an up-to-date and accurate answer.\n';
    return output;
}

/**
 * Detects if a query is academic/research focused.
 */
function isAcademicQuery(query: string): { isAcademic: boolean; topic: string | null } {
    const academicPatterns = [
        /(?:latest\s+)?research\s+(?:papers?|about|on|for)\s+(.+)/i,
        /(?:find|search|show)\s+(?:arxiv|scholar|academic)\s+(?:papers?\s+)?(?:about|on)\s+(.+)/i,
        /analysis\s+of\s+(?:the\s+)?paper\s+(.+)/i,
        /study\s+(?:about|on)\s+(.+)/i
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
