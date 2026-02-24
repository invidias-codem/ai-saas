import { sanitizeForLog } from '@/lib/security/urlValidator';

import axios from 'axios';

const ANYCRAWL_API_KEY = process.env.ANYCRAWL_API_KEY;
const ANYCRAWL_API_URL = process.env.ANYCRAWL_API_URL || 'https://api.anycrawl.dev'; // Default to public or self-hosted

export interface SearchResult {
    title: string;
    snippet: string;
    url: string;
    content?: string;
}

export interface CrawlResult {
    url: string;
    markdown: string;
    metadata?: any;
}

/**
 * Searches the web using AnyCrawl's search endpoint (if available) or by crawling specific SERP URLs.
 * Note: If AnyCrawl is purely a crawler, we might need to crawl a search engine results page (e.g. Google/Bing).
 * For this implementation, we'll assume AnyCrawl has a search capability or we use it to crawl a search engine URL.
 * 
 * Update: AnyCrawl documentation usually focuses on 'crawl' and 'scrape'. 
 * We will implement a 'search' by constructing a Google/Bing query URL and crawling it,
 * OR if AnyCrawl has a dedicated search endpoint, we use that.
 * 
 * Based on common patterns for "AnyCrawl" type tools, they often act as a gateway to "get readable content from URL".
 * So a "search" might need a separate SERP provider OR we crawl `google.com/search?q=...`.
 * 
 * Let's assume we crawl a search engine result for now to get links, then crawl top links?
 * Actually, for speed, let's try to find a direct search endpoint or assume the user wants to crawl specific pages.
 * 
 * However, the user asked for "Web Search". 
 * If AnyCrawl is strictly a "URL -> Markdown" tool, we need a way to get URLs first.
 * Many LLM-ready crawlers have a `/search` endpoint that wraps Google.
 * Let's assume a standard `/v1/search` or similar exists. If not, we will need to clarify.
 * 
 * Ref: The user pointed to "AnyCrawl GitHub".
 * Looking at typical "Web Search for LLM" flows:
 * 1. LLM generates specific query.
 * 2. System calls Search API -> gets URLs.
 * 3. System calls Crawler (AnyCrawl) -> gets Content.
 * 
 * If AnyCrawl *is* the search API too (like Tavily), great. 
 * If not, we still need a SERP source. 
 * 
 * LIMITATION: Without a dedicated SERP API key (Google/Bing), "searching" is hard.
 * We will implement `searchWeb` to attempts to crawl a DuckDuckGo result page as a fallback 
 * if no direct search API is provided by AnyCrawl.
 */
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

/**
 * Searches the web using AnyCrawl's native /v1/search endpoint.
 */
export async function searchWeb(query: string, limit: number = 3): Promise<SearchResult[]> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (ANYCRAWL_API_KEY) {
            headers['Authorization'] = `Bearer ${ANYCRAWL_API_KEY}`;
        }

        console.log(`[AnyCrawl] Searching for: ${query}`);

        // Native search endpoint - AnyCrawl uses 'query' not 'q'
        const response = await axios.post(`${ANYCRAWL_API_URL}/v1/search`, {
            query: query,
            limit: limit
        }, {
            headers,
            timeout: 5000 // Short timeout for local, fail fast to fallback
        });

        // Normalize response
        let results: any[] = [];
        if (response.data && response.data.success && Array.isArray(response.data.data)) {
            results = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
            results = response.data;
        } else if (response.data && response.data.results && Array.isArray(response.data.results)) {
            results = response.data.results;
        }

        console.log(`[AnyCrawl] Got ${results.length} search results`);

        // Map to SearchResult interface
        return results.map((item: any) => ({
            title: item.title || 'No Title',
            url: item.url || item.link,
            snippet: item.snippet || item.body || item.description || ''
        })).slice(0, limit);

    } catch (error: any) {
        console.warn('[AnyCrawl] Native search failed:', error?.message || error);

        // Fallback 1: Tavily (Preferred)
        if (TAVILY_API_KEY) {
            console.log('[AnyCrawl] Falling back to Tavily API...');
            try {
                const response = await axios.post('https://api.tavily.com/search', {
                    api_key: TAVILY_API_KEY,
                    query: query,
                    max_results: limit,
                    search_depth: 'basic'
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                // Tavily accepts key in body often, but let's double check standard usage. 
                // Usually POST body: { api_key: "...", query: "...", ... }
                // Let's retry with api_key in body if needed, but for now assuming standard POST.

                // Official Tavily API structure:
                // POST https://api.tavily.com/search
                // { api_key: "...", query: "...", ... }

                const tavilyData = response.data;
                if (tavilyData.results) {
                    return tavilyData.results.map((r: any) => ({
                        title: r.title,
                        url: r.url,
                        snippet: r.content
                    }));
                }
            } catch (tavilyError) {
                console.error('[AnyCrawl] Tavily fallback failed:', tavilyError);
            }
        }

        // Fallback 2: Try to crawl DuckDuckGo directly
        console.log('[AnyCrawl] Falling back to DuckDuckGo scrape...');
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const crawlResult = await crawlUrl(searchUrl);

        if (!crawlResult || !crawlResult.markdown) {
            console.warn('[AnyCrawl] Fallback scrape also failed');
            return [];
        }

        return parseDuckDuckGoMarkdown(crawlResult.markdown, limit);
    }
}

/**
 * Crawls a specific URL and returns LLM-ready markdown.
 * Uses AnyCrawl's /v1/scrape endpoint.
 */
export async function crawlUrl(url: string): Promise<CrawlResult | null> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (ANYCRAWL_API_KEY) {
            headers['Authorization'] = `Bearer ${ANYCRAWL_API_KEY}`;
        }

        // AnyCrawl uses /v1/scrape with options.formats array
        const body = {
            url: url,
            options: {
                formats: ['markdown']
            }
        };

        console.log(`[AnyCrawl] Scraping: ${sanitizeForLog(url)}`);
        const response = await axios.post(`${ANYCRAWL_API_URL}/v1/scrape`, body, {
            headers,
            timeout: 15000 // 15 second timeout for scrape
        });

        console.log(`[AnyCrawl] Scrape response status:`, response.status);
        console.log(`[AnyCrawl] Scrape response success:`, response.data?.success);

        // Handle AnyCrawl response structure: { success: true, data: { markdown: "..." } }
        if (response.data?.success && response.data?.data?.markdown) {
            console.log(`[AnyCrawl] Got markdown from data.data.markdown, length: ${response.data.data.markdown.length}`);
            return {
                url,
                markdown: response.data.data.markdown,
                metadata: response.data.data.metadata
            };
        }

        // Alternative: direct markdown property
        if (response.data?.markdown) {
            console.log(`[AnyCrawl] Got markdown from data.markdown, length: ${response.data.markdown.length}`);
            return {
                url,
                markdown: response.data.markdown,
                metadata: response.data.metadata
            };
        }

        // Backup: Some APIs return just the text/markdown directly
        if (typeof response.data === 'string') {
            console.log(`[AnyCrawl] Got markdown as string, length: ${response.data.length}`);
            return { url, markdown: response.data };
        }

        console.warn(`[AnyCrawl] Unexpected response structure:`, JSON.stringify(response.data).substring(0, 500));
        return null;

    } catch (error: any) {
        console.error(`[AnyCrawl] Scrape error for ${sanitizeForLog(url)}:`, error?.response?.data || error?.message || error);
        return null;
    }
}

/**
 * Helper to parse crawled DDG page markdown.
 * DuckDuckGo HTML usually results in markdown links like: [Title](url) snippet...
 */
function parseDuckDuckGoMarkdown(markdown: string, limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = markdown.split('\n');

    // Very basic parser looking for the structure of DDG results in markdown converted form
    // Structure often: "## [Title](url)" followed by snippet

    let currentResult: Partial<SearchResult> | null = null;

    for (const line of lines) {
        if (results.length >= limit) break;

        // Detect link line: [Title](url)
        const linkMatch = line.match(/^\[(.*?)\]\((.*?)\)/) || line.match(/^## \[(.*?)\]\((.*?)\)/);

        if (linkMatch) {
            // Save previous if exists
            if (currentResult && currentResult.title && currentResult.url) {
                results.push(currentResult as SearchResult);
            }

            // Start new
            const url = linkMatch[2];
            // Filter out internal DDG links or ads
            if (url.startsWith('//') || url.startsWith('javascript:') || url.startsWith('data:') || url.includes('duckduckgo.com')) {
                currentResult = null;
                continue;
            }

            currentResult = {
                title: linkMatch[1],
                url: url,
                snippet: ''
            };
        } else if (currentResult) {
            // Append content to snippet
            if (line.trim().length > 0 && !line.includes('[') && !line.startsWith('*')) {
                currentResult.snippet += line.trim() + ' ';
            }
        }
    }

    // Push last one
    if (currentResult && currentResult.title && currentResult.url && results.length < limit) {
        results.push(currentResult as SearchResult);
    }

    return results;
}
