import { SearchEngine, SearchOptions, SearchResult, SearchTask, WebSearchResult, ImageSearchResult, NewsSearchResult } from "./types.js";
import { log } from "@anycrawl/libs/log";

export class ACSearchEngine implements SearchEngine {
    // This engine can accept arbitrary limit in a single request
    public readonly supportsDirectLimit = true;
    private baseUrl?: string;
    private readonly defaultHeaders = {
        Accept: "application/json",
    };

    constructor(baseUrl?: string) {
        // Allow custom AC-Engine instance URL via environment or parameter
        this.baseUrl = baseUrl || process.env.ANYCRAWL_AC_ENGINE_URL;
        // Remove trailing slash if present
        this.baseUrl = this.baseUrl?.replace(/\/$/, "");
    }

    getName(): string {
        return "AC-Engine";
    }

    private buildSearchUrl(options: SearchOptions): string {
        const { query, offset = 0, page, limit, lang, country, timeRange, safe_search, sources } = options as any;
        const params = new URLSearchParams();
        if (query) params.set("q", String(query));
        if (typeof offset === "number") params.set("start", String(offset));
        // Prefer limit; if absent but page provided, infer limit = page * 10
        const defaultPerPage = 10;
        let effectiveLimit: number | undefined;
        if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
            effectiveLimit = limit;
        } else if (typeof page === "number" && Number.isFinite(page) && page > 0) {
            effectiveLimit = page * defaultPerPage;
        }
        if (typeof effectiveLimit === "number") params.set("limit", String(effectiveLimit));
        if (lang) params.set("lang", String(lang));
        if (country) params.set("country", String(country));
        if (timeRange) params.set("timeRange", String(timeRange));
        if (safe_search !== undefined && safe_search !== null) params.set("safe_search", String(safe_search));
        if (sources) params.set("sources", String(sources));

        return `${this.baseUrl}/search?${params.toString()}`;
    }

    async search(options: SearchOptions): Promise<SearchTask> {
        try {
            const url = this.buildSearchUrl(options);
            return {
                url,
                headers: this.defaultHeaders,
                cookies: {},
                requireProxy: false,
            };
        } catch (error) {
            log.error(`AC-Engine search error: ${error}`);
            throw error;
        }
    }

    async parse(response: string | any): Promise<SearchResult[]> {
        try {
            const data = typeof response === "string" ? JSON.parse(response) : response;
            const items = Array.isArray(data?.results) ? data.results : [];
            const results: SearchResult[] = [];

            for (const item of items) {
                const category = item.category || "web";
                // Skip entries without url
                if (!item.url) continue;

                if (category === "images") {
                    const img: ImageSearchResult = {
                        category: "images",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.description || item.snippet || "",
                        source: item.source || "AC-Engine",
                        imageUrl: item.imageUrl,
                        imageWidth: item.imageWidth,
                        imageHeight: item.imageHeight,
                        position: item.position,
                        thumbnail_src: item.thumbnail_src,
                        img_format: item.img_format,
                        filesize: item.filesize,
                    };
                    results.push(img);
                } else if (category === "news") {
                    const news: NewsSearchResult = {
                        category: "news",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.description || item.snippet || "",
                        source: item.source || "AC-Engine",
                        snippet: item.snippet,
                        date: item.date,
                        imageUrl: item.imageUrl,
                    };
                    results.push(news);
                } else {
                    const web: WebSearchResult = {
                        category: "web",
                        title: item.title || "",
                        url: item.url || "",
                        description: item.description || item.snippet || "",
                        source: item.source || "AC-Engine",
                    };
                    results.push(web);
                }
            }

            return results;
        } catch (error) {
            log.error("Error parsing AC-Engine results:", { error: String(error) });
            return [];
        }
    }
}


