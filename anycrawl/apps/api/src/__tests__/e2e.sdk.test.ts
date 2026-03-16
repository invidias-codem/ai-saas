import { describe, it, expect, beforeAll } from "@jest/globals";

const API_KEY = process.env.ANYCRAWL_API_KEY;
const BASE_URL = process.env.ANYCRAWL_BASE_URL || "https://api.anycrawl.dev";
const RUN_LIVE = process.env.ANYCRAWL_RUN_LIVE === "1" || process.env.ANYCRAWL_RUN_LIVE === "true";

// Only run live tests when key exists and user opts in
const maybeDescribe = API_KEY && RUN_LIVE ? describe : describe.skip;

describe("AnyCrawlClient (env-gated)", () => {
    it("skips live tests without ANYCRAWL_API_KEY or ANYCRAWL_RUN_LIVE", () => {
        if (API_KEY && RUN_LIVE) {
            // This spec is only to keep jest from complaining when describe.skip above is not used
            expect(true).toBe(true);
        } else {
            expect(true).toBe(true);
        }
    });
});

maybeDescribe("AnyCrawlClient E2E", () => {
    let client: any;
    let AnyCrawlClient: any;

    beforeAll(async () => {
        // Use dynamic import to avoid "module is already linked" error
        const sdkModule = await import("@anycrawl/js-sdk");
        AnyCrawlClient = sdkModule.AnyCrawlClient;
        client = new AnyCrawlClient(API_KEY as string, BASE_URL);
    });

    it("healthCheck returns ok", async () => {
        const res = await client.healthCheck();
        expect(res.status).toBeDefined();
    }, 30000);

    it("scrape returns completed or failed structure", async () => {
        const res = await client.scrape({
            url: "https://example.com",
            engine: "cheerio",
            formats: ["markdown"],
            timeout: 30000,
        });
        // status can be completed or failed, but structure should be valid
        expect(["completed", "failed"]).toContain(res.status);
        expect(res.url).toContain("http");
    }, 120000);

    it.each([
        ["cheerio"],
        ["playwright"],
        ["puppeteer"],
    ])("scrape works with engine=%s", async (engine) => {
        const res = await client.scrape({
            url: "https://example.com",
            engine: engine as any,
            formats: ["markdown"],
            timeout: 45000,
        });
        expect(["completed", "failed"]).toContain(res.status);
        expect(res.url).toContain("http");
    }, 180000);

    it("scrape supports json_options extraction hints", async () => {
        const res = await client.scrape({
            url: "https://example.com",
            engine: "cheerio",
            formats: ["markdown"],
            timeout: 45000,
            json_options: {
                schema: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                    },
                },
                user_prompt: "Extract the page title",
                schema_name: "PageTitle",
                schema_description: "Extracts page title only",
            },
            extract_source: "markdown",
        });
        expect(["completed", "failed"]).toContain(res.status);
        expect(res.url).toContain("http");
    }, 180000);

    it("createCrawl returns job id", async () => {
        const crawl = await client.createCrawl({
            url: "https://example.com",
            engine: "cheerio",
            formats: ["markdown"],
            limit: 1,
            timeout: 30000,
            extract_source: "markdown",
            scrape_options: {
                json_options: {
                    schema: { type: "object" },
                    user_prompt: "Extract basic content",
                },
            },
        });
        expect(crawl.job_id).toBeDefined();
    }, 120000);

    it("crawl end-to-end: 5 pages with markdown & json_options, then fetch results", async () => {
        const start = await client.createCrawl({
            url: "https://example.com",
            engine: "cheerio",
            formats: ["markdown", "html"],
            limit: 5,
            timeout: 45000,
            extract_source: "markdown",
            scrape_options: {
                json_options: {
                    schema: { type: "object" },
                    user_prompt: "Extract minimal info",
                },
            },
        });
        expect(start.job_id).toBeDefined();

        // Poll status up to ~2 minutes
        let status: any;
        for (let i = 0; i < 24; i++) {
            status = await client.getCrawlStatus(start.job_id);
            if (status.status === "completed" || (status.completed && status.completed > 0)) break;
            await new Promise((r) => setTimeout(r, 5000));
        }
        expect(status).toBeDefined();

        // Fetch first page of results
        const results = await client.getCrawlResults(start.job_id, 0);
        expect(Array.isArray(results.data)).toBe(true);
        if (typeof results.total === "number") {
            expect(results.total).toBeLessThanOrEqual(5);
        }
        if (results.data.length > 0) {
            const first: any = results.data[0];
            // If provider returns content fields, ensure at least one exists when we requested markdown/html
            const hasContent = "markdown" in first || "html" in first;
            expect(hasContent).toBe(true);
        }
    }, 180000);

    it("search minimal works (no scrape enrichment)", async () => {
        const results = await client.search({
            query: "site:example.com",
            scrape_options: { engine: "cheerio" },
            limit: 3,
        });
        expect(Array.isArray(results)).toBe(true);
    }, 120000);

    it.each([
        ["cheerio"],
        ["playwright"],
        ["puppeteer"],
    ])("search works with engine=%s and supports json_options", async (engine) => {
        const results = await client.search({
            query: "site:example.com",
            limit: 1,
            scrape_options: {
                engine: engine as any,
                json_options: {
                    schema: { type: "object" },
                    user_prompt: "Extract minimal content",
                },
            },
        });
        expect(Array.isArray(results)).toBe(true);
    }, 240000);
});


