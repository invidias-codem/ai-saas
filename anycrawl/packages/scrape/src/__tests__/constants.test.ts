import * as constants from "@anycrawl/libs/constants";

describe("Constants", () => {
    describe("Job Types", () => {
        test("should have correct job type constants", () => {
            expect(constants.JOB_TYPE_CRAWL).toBe("crawl");
            expect(constants.JOB_TYPE_SCRAPE).toBe("scrape");
        });

        test("should export job type constants", () => {
            expect(typeof constants.JOB_TYPE_CRAWL).toBe("string");
            expect(typeof constants.JOB_TYPE_SCRAPE).toBe("string");
        });

        test("job types should be different", () => {
            expect(constants.JOB_TYPE_CRAWL).not.toBe(constants.JOB_TYPE_SCRAPE);
        });
    });

    describe("Engine Types", () => {
        test("should have engine type constants if defined", () => {
            // Check if engine type constants exist
            if ('ENGINE_TYPE_CHEERIO' in constants) {
                expect(typeof (constants as any).ENGINE_TYPE_CHEERIO).toBe("string");
            }
            if ('ENGINE_TYPE_PLAYWRIGHT' in constants) {
                expect(typeof (constants as any).ENGINE_TYPE_PLAYWRIGHT).toBe("string");
            }
            if ('ENGINE_TYPE_PUPPETEER' in constants) {
                expect(typeof (constants as any).ENGINE_TYPE_PUPPETEER).toBe("string");
            }
        });
    });

    describe("Default Values", () => {
        test("should have default timeout constants if defined", () => {
            if ('DEFAULT_TIMEOUT' in constants) {
                expect(typeof (constants as any).DEFAULT_TIMEOUT).toBe("number");
                expect((constants as any).DEFAULT_TIMEOUT).toBeGreaterThan(0);
            }
        });

        test("should have default concurrency constants if defined", () => {
            if ('DEFAULT_CONCURRENCY' in constants) {
                expect(typeof (constants as any).DEFAULT_CONCURRENCY).toBe("number");
                expect((constants as any).DEFAULT_CONCURRENCY).toBeGreaterThan(0);
            }
        });

        test("should have default retry constants if defined", () => {
            if ('DEFAULT_RETRIES' in constants) {
                expect(typeof (constants as any).DEFAULT_RETRIES).toBe("number");
                expect((constants as any).DEFAULT_RETRIES).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe("Status Constants", () => {
        test("should have status constants if defined", () => {
            if ('STATUS_PENDING' in constants) {
                expect(typeof (constants as any).STATUS_PENDING).toBe("string");
            }
            if ('STATUS_RUNNING' in constants) {
                expect(typeof (constants as any).STATUS_RUNNING).toBe("string");
            }
            if ('STATUS_COMPLETED' in constants) {
                expect(typeof (constants as any).STATUS_COMPLETED).toBe("string");
            }
            if ('STATUS_FAILED' in constants) {
                expect(typeof (constants as any).STATUS_FAILED).toBe("string");
            }
        });
    });

    describe("Error Constants", () => {
        test("should have error type constants if defined", () => {
            if ('ERROR_TYPE_NETWORK' in constants) {
                expect(typeof (constants as any).ERROR_TYPE_NETWORK).toBe("string");
            }
            if ('ERROR_TYPE_TIMEOUT' in constants) {
                expect(typeof (constants as any).ERROR_TYPE_TIMEOUT).toBe("string");
            }
            if ('ERROR_TYPE_PARSING' in constants) {
                expect(typeof (constants as any).ERROR_TYPE_PARSING).toBe("string");
            }
        });
    });

    describe("Configuration Constants", () => {
        test("should have configuration constants if defined", () => {
            if ('MAX_REQUESTS_PER_CRAWL' in constants) {
                expect(typeof (constants as any).MAX_REQUESTS_PER_CRAWL).toBe("number");
                expect((constants as any).MAX_REQUESTS_PER_CRAWL).toBeGreaterThan(0);
            }
            if ('MAX_DEPTH' in constants) {
                expect(typeof (constants as any).MAX_DEPTH).toBe("number");
                expect((constants as any).MAX_DEPTH).toBeGreaterThan(0);
            }
        });
    });

    describe("Exported Constants Structure", () => {
        test("should export at least the required job type constants", () => {
            const exportedKeys = Object.keys(constants);
            expect(exportedKeys).toContain("JOB_TYPE_CRAWL");
            expect(exportedKeys).toContain("JOB_TYPE_SCRAPE");
        });

        test("all exported constants should have valid types", () => {
            Object.entries(constants).forEach(([key, value]) => {
                // Allow arrays and objects for constants like ALLOWED_ENGINES, SCRAPE_FORMATS
                expect(typeof value).toMatch(/^(string|number|boolean|object)$/);
                expect(key).toMatch(/^[A-Z_]+$/); // Constants should be uppercase with underscores
            });
        });
    });
});