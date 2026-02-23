import {
    SearchEngine,
    SearchOptions,
    SearchResult,
    SearchTask,
    ImageSearchResult,
    NewsSearchResult,
    WebSearchResult,
} from "./types.js";
import { log } from "@anycrawl/libs/log";

export class SearxngSearchEngine implements SearchEngine {
    // This engine does not support arbitrary large limit in a single request
    public readonly supportsDirectLimit = false;
    private baseUrl?: string;
    private readonly defaultHeaders = {
        Accept: "application/json",
    };

    constructor(baseUrl?: string) {
        // Allow custom SearXNG instance URL via environment variable or parameter
        this.baseUrl = baseUrl || process.env.ANYCRAWL_SEARXNG_URL;
        // Remove trailing slash if present
        this.baseUrl = this.baseUrl?.replace(/\/$/, "");
    }

    getName(): string {
        return "SearXNG";
    }

    /**
     * Build the search URL for SearXNG
     * @param query - The search query
     * @param pageNo - The page number (1-based)
     * @param options - Additional search options
     * @returns The search URL
     */
    private buildSearchUrl(query: string, pageNo: number, options: SearchOptions): string {
        const params = new URLSearchParams({
            q: query,
            format: "json",
            pageno: pageNo.toString(),
        });

        // Add language if specified
        if (options.lang) {
            params.append("language", options.lang);
        }

        // Map sources to SearXNG categories when provided
        if (options.sources) {
            if (options.sources === "web") params.append("categories", "general");
            else if (options.sources === "images") params.append("categories", "images");
            else if (options.sources === "news") params.append("categories", "news");
        } else if (options.categories) {
            // Backward-compat: allow direct categories passthrough if provided
            params.append("categories", options.categories);
        }

        // Add time range if specified
        if (options.timeRange) {
            params.append("time_range", options.timeRange);
        }

        // Add safe search if specified
        if (options.safe_search !== undefined && options.safe_search !== null) {
            // SearXNG uses 0, 1, 2 for safe search (same as our interface)
            params.append("safesearch", options.safe_search.toString());
        }

        return `${this.baseUrl}/search?${params.toString()}`;
    }

    /**
     * Build the search task for SearXNG
     * @param options - The search options of type SearchOptions
     * @returns The search task
     */
    async search(options: SearchOptions): Promise<SearchTask> {
        const { query, page = 1 } = options;
        try {
            const url = this.buildSearchUrl(query, page, options);
            return {
                url: url,
                headers: this.defaultHeaders,
                cookies: {},
                requireProxy: false, // SearXNG doesn't need proxy
            };
        } catch (error) {
            log.error(`SearXNG search error: ${error}`);
            throw error;
        }
    }

    /**
     * Parse the search results from the SearXNG JSON response
     * @param response - The JSON response from SearXNG (can be string or already parsed object)
     * @returns The search results with proper typing based on category
     */
    async parse(response: string | any, request?: any): Promise<SearchResult[]> {
        try {
            // Handle both string and already-parsed JSON responses
            const data = typeof response === 'string' ? JSON.parse(response) : response;
            const results: SearchResult[] = [];

            if (!data.results || !Array.isArray(data.results)) {
                log.info("No results found in SearXNG response");
                return results;
            }

            for (const item of data.results) {
                // Skip results without URL (suggestions, etc.)
                if (!item.url) {
                    continue;
                }

                const category = item.category || "web";

                // Create result based on category
                if (category === "images") {
                    // Parse resolution (e.g., "1000×1500" or "1000x1500")
                    let imageWidth: number | undefined;
                    let imageHeight: number | undefined;
                    if (item.resolution) {
                        const match = item.resolution.match(/(\d+)\s*[×x]\s*(\d+)/);
                        if (match) {
                            imageWidth = parseInt(match[1], 10);
                            imageHeight = parseInt(match[2], 10);
                        }
                    }

                    const imageResult: ImageSearchResult = {
                        category: "images",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.content || item.snippet || "",
                        source: `SearXNG (${item.engine || "unknown"})`,
                        imageUrl: item.img_src,
                        imageWidth,
                        imageHeight,
                        position: item.positions && Array.isArray(item.positions) ? item.positions[0] : undefined,
                        thumbnail_src: item.thumbnail_src,
                        img_format: item.img_format,
                        filesize: item.filesize,
                    };
                    results.push(imageResult);

                } else if (category === "news") {
                    const newsResult: NewsSearchResult = {
                        category: "news",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.content || item.snippet || "",
                        source: `SearXNG (${item.engine || "unknown"})`,
                        snippet: item.content || item.snippet || "",
                        date: item.publishedDate || item.pubdate,
                        imageUrl: item.thumbnail || undefined,
                    };
                    results.push(newsResult);

                } else {
                    // Default to web result for other categories
                    const webResult: WebSearchResult = {
                        category: "web",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.content || item.snippet || "",
                        source: `SearXNG (${item.engine || "unknown"})`,
                    };
                    results.push(webResult);
                }
            }

            return results;
        } catch (error) {
            log.error("Error parsing SearXNG results:", { error: String(error) });
            return [];
        }
    }
}

