import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import { TemplateCache } from "../cache/index.js";
import type { TemplateConfig } from "@anycrawl/libs";

describe("TemplateCache", () => {
    let cache: TemplateCache;
    let mockTemplate: TemplateConfig;

    beforeEach(() => {
        cache = new TemplateCache({
            ttl: 1000, // 1 second for testing
            maxSize: 2,
            cleanupInterval: 500,
        });

        mockTemplate = {
            uuid: "test-uuid",
            templateId: "test-template",
            name: "Test Template",
            description: "A test template",
            tags: ["test"],
            version: "1.0.0",
            pricing: { perCall: 1, currency: "credits" },
            templateType: "scrape",
            reqOptions: {
                engine: "cheerio",
                formats: ["json"],
            },
            metadata: {
                difficulty: "beginner",
                estimatedTime: 1,
                requiresCustomHandlers: false,
                reviewStatus: "approved",
            },
            createdBy: "test-user",
            status: "published",
            reviewStatus: "approved",
            trusted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        } as TemplateConfig;
    });

    afterEach(() => {
        cache.destroy();
    });

    describe("set and get", () => {
        it("should store and retrieve template", async () => {
            await cache.set("test-template", mockTemplate);
            const result = await cache.get("test-template");

            expect(result).toEqual(mockTemplate);
        });

        it("should return null for non-existent template", async () => {
            const result = await cache.get("non-existent");

            expect(result).toBeNull();
        });

        it("should return null for expired template", async () => {
            await cache.set("test-template", mockTemplate);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100));

            const result = await cache.get("test-template");

            expect(result).toBeNull();
        });
    });

    describe("cache size management", () => {
        it("should remove oldest entry when cache is full", async () => {
            const template1 = { ...mockTemplate, templateId: "template-1" };
            const template2 = { ...mockTemplate, templateId: "template-2" };
            const template3 = { ...mockTemplate, templateId: "template-3" };

            await cache.set("template-1", template1);
            await cache.set("template-2", template2);
            await cache.set("template-3", template3); // Should remove template-1

            const result1 = await cache.get("template-1");
            const result2 = await cache.get("template-2");
            const result3 = await cache.get("template-3");

            expect(result1).toBeNull();
            expect(result2).toEqual(template2);
            expect(result3).toEqual(template3);
        });
    });

    describe("invalidate", () => {
        it("should remove specific template from cache", async () => {
            await cache.set("test-template", mockTemplate);
            await cache.invalidate("test-template");

            const result = await cache.get("test-template");

            expect(result).toBeNull();
        });
    });

    describe("clear", () => {
        it("should remove all templates from cache", async () => {
            await cache.set("template-1", mockTemplate);
            await cache.set("template-2", mockTemplate);
            await cache.clear();

            const result1 = await cache.get("template-1");
            const result2 = await cache.get("template-2");

            expect(result1).toBeNull();
            expect(result2).toBeNull();
        });
    });

    describe("getStats", () => {
        it("should return cache statistics", async () => {
            await cache.set("template-1", mockTemplate);

            const stats = cache.getStats();

            expect(stats.size).toBe(1);
            expect(stats.maxSize).toBe(2);
        });
    });

    describe("cleanup", () => {
        it("should automatically clean up expired entries", async () => {
            await cache.set("test-template", mockTemplate);

            // Wait for cleanup to run
            await new Promise(resolve => setTimeout(resolve, 1600));

            const result = await cache.get("test-template");

            expect(result).toBeNull();
        });
    });
});