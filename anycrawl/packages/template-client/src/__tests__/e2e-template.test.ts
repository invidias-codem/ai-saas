import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";
import { getDB, templates, templateExecutions, eq } from "@anycrawl/db";
import { TemplateClient } from "../client/index.js";
import { createTemplateScript } from "../libs/create-template.js";
import type { TemplateConfig, TemplateExecutionContext } from "@anycrawl/libs";

describe("Template E2E Tests", () => {
    let templateClient: TemplateClient;
    let createdTemplate: TemplateConfig;
    let db: any;

    beforeAll(async () => {
        // Initialize database and client
        db = await getDB();
        templateClient = new TemplateClient();

        // Create test template
        createdTemplate = await createTemplateScript();
        console.log(`✅ Test template created successfully: ${createdTemplate.templateId}`);
    });

    afterAll(async () => {
        // Clean up test data
        if (createdTemplate?.uuid) {
            try {
                // Delete template execution record
                await db.delete(templateExecutions)
                    .where(eq(templateExecutions.templateUuid, createdTemplate.uuid));

                // Delete template
                await db.delete(templates)
                    .where(eq(templates.uuid, createdTemplate.uuid));

                console.log(`🧹 Test data cleanup completed: ${createdTemplate.templateId}`);
            } catch (error) {
                console.warn("Error cleaning up test data:", error);
            }
        }
    });

    describe("Template Database Operations", () => {
        it("should be able to get created template from database", async () => {
            const template = await templateClient.getTemplate(createdTemplate.templateId);

            expect(template).toBeDefined();
            expect(template.templateId).toBe(createdTemplate.templateId);
            expect(template.name).toBe(createdTemplate.name);
            expect(template.status).toBe("published");
            expect(template.reviewStatus).toBe("approved");
            expect(template.pricing.perCall).toBe(3);
            expect(template.tags).toContain("news");
            expect((template.reqOptions as any).engine).toBe("playwright");
        });

        it("should be able to list templates", async () => {
            const result = await templateClient.getTemplates({
                status: "published",
                limit: 10
            });

            expect(result).toBeDefined();
            expect(result.templates).toBeInstanceOf(Array);
            expect(result.total).toBeGreaterThan(0);

            // Check if our template is in the list
            const ourTemplate = result.templates.find(t => t.templateId === createdTemplate.templateId);
            expect(ourTemplate).toBeDefined();
        });
    });

    describe("Template Execution", () => {
        it("should be able to execute template's default logic", async () => {
            const context: TemplateExecutionContext = {
                templateId: createdTemplate.templateId,
                request: {
                    url: "https://news.ycombinator.com/item?id=1",
                    method: "GET",
                    headers: {
                        "User-Agent": "AnyCrawl-Test/1.0"
                    }
                },
                variables: {
                    targetUrl: "https://news.ycombinator.com/item?id=1",
                    waitTime: 1000,
                    includeImages: false,
                    maxContentLength: 5000
                },
                metadata: {
                    testRun: true,
                    environment: "test"
                }
            };

            const result = await templateClient.executeTemplate(
                createdTemplate.templateId,
                context
            );

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.executionTime).toBeGreaterThan(0);
            expect(result.creditsCharged).toBe(3);
            expect(result.data).toBeDefined();

            // Check the returned data structure
            expect(result.data.url).toBe(context.request.url);
            expect(result.data.templateId).toBe(createdTemplate.templateId);
            expect(result.data.reqOptions).toBeDefined();
            expect(result.data.variables).toEqual(context.variables);
        });

        it("should record template execution to database", async () => {
            const context: TemplateExecutionContext = {
                templateId: createdTemplate.templateId,
                request: {
                    url: "https://techcrunch.com/test-article",
                    method: "GET"
                },
                variables: {
                    targetUrl: "https://techcrunch.com/test-article",
                    waitTime: 2000
                }
            };

            // Execute template
            await templateClient.executeTemplate(createdTemplate.templateId, context);

            // Check if execution record is saved
            const executions = await db
                .select()
                .from(templateExecutions)
                .where(eq(templateExecutions.templateUuid, createdTemplate.uuid))
                .limit(1);

            expect(executions).toBeDefined();
            expect(executions.length).toBeGreaterThan(0);

            const execution = executions[0];
            expect(execution.templateUuid).toBe(createdTemplate.uuid);
            expect(execution.success).toBe(true);
            expect(execution.processingTimeMs).toBeGreaterThan(0);
            expect(execution.creditsCharged).toBe(3);
            expect(execution.createdAt).toBeDefined();
        });

        it("should handle non-existent template", async () => {
            const context: TemplateExecutionContext = {
                templateId: "non-existent-template",
                request: {
                    url: "https://example.com",
                    method: "GET"
                }
            };

            await expect(
                templateClient.executeTemplate("non-existent-template", context)
            ).rejects.toThrow("Template not found");
        });
    });

    describe("Template Validation", () => {
        it("should validate template's required fields", () => {
            expect(createdTemplate.uuid).toBeDefined();
            expect(createdTemplate.templateId).toBeDefined();
            expect(createdTemplate.name).toBeDefined();
            expect(createdTemplate.tags).toBeInstanceOf(Array);
            expect(createdTemplate.version).toBeDefined();
            expect(createdTemplate.pricing).toBeDefined();
            expect(createdTemplate.pricing.perCall).toBeGreaterThan(0);
            expect(createdTemplate.pricing.currency).toBe("credits");
            expect(createdTemplate.reqOptions).toBeDefined();
            expect(createdTemplate.metadata).toBeDefined();
            expect(createdTemplate.createdBy).toBeDefined();
            expect(createdTemplate.status).toBeDefined();
            expect(createdTemplate.reviewStatus).toBeDefined();
        });

        it("should validate template's domain restriction configuration", () => {
            expect(createdTemplate.metadata.allowedDomains).toBeDefined();
            expect(createdTemplate.metadata.allowedDomains?.type).toBe("glob");
            expect(createdTemplate.metadata.allowedDomains?.patterns).toBeInstanceOf(Array);
            expect(createdTemplate.metadata.allowedDomains?.patterns.length).toBeGreaterThan(0);

            // Check if it contains the expected domain patterns
            const patterns = createdTemplate.metadata.allowedDomains?.patterns || [];
            expect(patterns).toContain("*.news.ycombinator.com");
            expect(patterns).toContain("*.techcrunch.com");
        });

        it("should validate custom handler configuration", () => {
            expect(createdTemplate.customHandlers).toBeDefined();
            expect(createdTemplate.customHandlers?.requestHandler).toBeDefined();
            expect(createdTemplate.customHandlers?.requestHandler?.enabled).toBe(true);
            expect(createdTemplate.customHandlers?.requestHandler?.code).toBeDefined();
            expect(createdTemplate.customHandlers?.requestHandler?.code.language).toBe("javascript");
            expect(createdTemplate.customHandlers?.requestHandler?.code.source).toBeDefined();
            expect(createdTemplate.customHandlers?.requestHandler?.code.source.length).toBeGreaterThan(100);

            expect(createdTemplate.customHandlers?.failedRequestHandler).toBeDefined();
            expect(createdTemplate.customHandlers?.failedRequestHandler?.enabled).toBe(true);
        });

        it("should validate template variable configuration", () => {
            expect(createdTemplate.variables).toBeDefined();

            if (createdTemplate.variables) {
                const targetUrl = createdTemplate.variables.targetUrl;
                const waitTime = createdTemplate.variables.waitTime;

                expect(targetUrl).toBeDefined();
                if (targetUrl) {
                    expect(targetUrl.type).toBe("url");
                    expect(targetUrl.required).toBe(true);
                    expect(targetUrl.defaultValue).toBeDefined();
                }

                expect(waitTime).toBeDefined();
                if (waitTime) {
                    expect(waitTime.type).toBe("number");
                    expect(waitTime.required).toBe(false);
                    expect(waitTime.defaultValue).toBe(2000);
                }
            }
        });
    });

    describe("Template Cache", () => {
        it("should cache the retrieved template", async () => {
            // First get
            const start1 = Date.now();
            const template1 = await templateClient.getTemplate(createdTemplate.templateId);
            const time1 = Date.now() - start1;

            // Second get (should be from cache)
            const start2 = Date.now();
            const template2 = await templateClient.getTemplate(createdTemplate.templateId);
            const time2 = Date.now() - start2;

            expect(template1).toEqual(template2);
            expect(time2).toBeLessThan(time1); // Cache should be faster
        });
    });

    describe("Error Handling", () => {
        it("should handle template execution error", async () => {
            // Create a failing execution context
            const context: TemplateExecutionContext = {
                templateId: createdTemplate.templateId,
                request: {
                    url: "invalid-url", // Invalid URL
                    method: "GET"
                },
                variables: {}
            };

            // Note: Since our template uses default execution logic, it will not actually fail
            // But we can test the error handling mechanism
            const result = await templateClient.executeTemplate(
                createdTemplate.templateId,
                context
            );

            // Even if the URL is invalid, the default template execution should succeed
            expect(result.success).toBe(true);
            expect(result.data.url).toBe("invalid-url");
        });
    });

});