import { describe, expect, it, beforeAll, afterAll } from "@jest/globals";
import { TemplateClient } from "../client/index.js";
import type { TemplateConfig, TemplateExecutionContext } from "@anycrawl/libs";

describe("Template Simple Tests", () => {
    let templateClient: TemplateClient;

    beforeAll(async () => {
        // Initialize client
        templateClient = new TemplateClient();
    });

    describe("Template Client Initialization", () => {
        it("should be able to create TemplateClient instance", () => {
            expect(templateClient).toBeDefined();
            expect(templateClient).toBeInstanceOf(TemplateClient);
        });
    });

    describe("Template Configuration Validation", () => {
        it("should validate template configuration basic structure", () => {
            const mockTemplate: TemplateConfig = {
                uuid: "test-uuid-001",
                templateId: "test-template",
                name: "Test Template",
                description: "This is a test template",
                tags: ["test", "example"],
                version: "1.0.0",
                pricing: {
                    perCall: 1,
                    currency: "credits",
                },
                templateType: "scrape",
                reqOptions: {
                    engine: "playwright",
                    formats: ["markdown", "json"],
                    timeout: 30000,
                    retry: true,
                },
                metadata: {
                    difficulty: "beginner",
                    estimatedTime: 2,
                    requiresCustomHandlers: false,
                    reviewStatus: "approved",
                },
                createdBy: "test-user",
                status: "published",
                reviewStatus: "approved",
                trusted: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Validate required fields
            expect(mockTemplate.uuid).toBeDefined();
            expect(mockTemplate.templateId).toBeDefined();
            expect(mockTemplate.name).toBeDefined();
            expect(mockTemplate.tags).toBeInstanceOf(Array);
            expect(mockTemplate.version).toBeDefined();
            expect(mockTemplate.pricing).toBeDefined();
            expect(mockTemplate.pricing.perCall).toBeGreaterThan(0);
            expect(mockTemplate.pricing.currency).toBe("credits");
            expect(mockTemplate.reqOptions).toBeDefined();
            expect(mockTemplate.metadata).toBeDefined();
            expect(mockTemplate.createdBy).toBeDefined();
            expect(mockTemplate.status).toBeDefined();
            expect(mockTemplate.reviewStatus).toBeDefined();
        });

        it("should validate template execution context structure", () => {
            const mockContext: TemplateExecutionContext = {
                templateId: "test-template",
                request: {
                    url: "https://example.com",
                    method: "GET",
                    headers: {
                        "User-Agent": "AnyCrawl-Test/1.0"
                    }
                },
                variables: {
                    targetUrl: "https://example.com",
                    timeout: 30000
                },
                metadata: {
                    testRun: true
                }
            };

            expect(mockContext.templateId).toBeDefined();
            expect(mockContext.request).toBeDefined();
            expect(mockContext.request.url).toBeDefined();
            expect(mockContext.variables).toBeDefined();
            expect(mockContext.metadata).toBeDefined();
        });
    });

    describe("Template Type Validation", () => {
        it("should support different engine types", () => {
            const engines = ["cheerio", "playwright", "puppeteer"] as const;

            engines.forEach(engine => {
                const mockTemplate: Partial<TemplateConfig> = {
                    reqOptions: {
                        engine,
                        formats: ["markdown"],
                    }
                };

                expect((mockTemplate.reqOptions as any)?.engine).toBe(engine);
            });
        });

        it("should support different output formats", () => {
            const formats = ["markdown", "html", "json", "text", "screenshot"] as const;

            const mockTemplate: Partial<TemplateConfig> = {
                reqOptions: {
                    engine: "playwright",
                    formats: [...formats],
                }
            };

            expect((mockTemplate.reqOptions as any)?.formats).toEqual(formats);
        });

        it("should support different difficulty levels", () => {
            const difficulties = ["beginner", "intermediate", "advanced"] as const;

            difficulties.forEach(difficulty => {
                const mockTemplate: Partial<TemplateConfig> = {
                    metadata: {
                        difficulty,
                        estimatedTime: 5,
                        requiresCustomHandlers: false,
                        reviewStatus: "approved",
                    }
                };

                expect(mockTemplate.metadata?.difficulty).toBe(difficulty);
            });
        });
    });

    describe("Template Variable Type Validation", () => {
        it("should support different variable types", () => {
            const variableTypes = ["string", "number", "boolean", "url"] as const;

            variableTypes.forEach(type => {
                const mockVariable = {
                    type,
                    description: `Test ${type} type variable`,
                    required: true,
                    defaultValue: type === "string" ? "test" :
                        type === "number" ? 123 :
                            type === "boolean" ? true :
                                "https://example.com"
                };

                expect(mockVariable.type).toBe(type);
                expect(mockVariable.description).toBeDefined();
                expect(mockVariable.required).toBe(true);
                expect(mockVariable.defaultValue).toBeDefined();
            });
        });
    });

    describe("Domain Restriction Configuration", () => {
        it("should support glob mode domain restriction", () => {
            const allowedDomains = {
                type: "glob" as const,
                patterns: [
                    "*.example.com",
                    "*.test.org",
                    "localhost",
                    "127.0.0.1"
                ]
            };

            expect(allowedDomains.type).toBe("glob");
            expect(allowedDomains.patterns).toBeInstanceOf(Array);
            expect(allowedDomains.patterns.length).toBeGreaterThan(0);
            expect(allowedDomains.patterns).toContain("*.example.com");
        });

        it("should support exact mode domain restriction", () => {
            const allowedDomains = {
                type: "exact" as const,
                patterns: [
                    "example.com",
                    "test.org",
                    "api.service.com"
                ]
            };

            expect(allowedDomains.type).toBe("exact");
            expect(allowedDomains.patterns).toBeInstanceOf(Array);
            expect(allowedDomains.patterns.length).toBeGreaterThan(0);
            expect(allowedDomains.patterns).toContain("example.com");
        });
    });

    describe("Custom Handler Configuration", () => {
        it("should support JavaScript custom handler", () => {
            const customHandler = {
                enabled: true,
                code: {
                    language: "javascript" as const,
                    source: `
                        function extractData() {
                            return {
                                title: document.title,
                                url: window.location.href
                            };
                        }
                        return extractData();
                    `
                }
            };

            expect(customHandler.enabled).toBe(true);
            expect(customHandler.code.language).toBe("javascript");
            expect(customHandler.code.source).toBeDefined();
            expect(customHandler.code.source.length).toBeGreaterThan(0);
        });

        it("should support TypeScript custom handler", () => {
            const customHandler = {
                enabled: true,
                code: {
                    language: "typescript" as const,
                    source: `
                        interface ExtractedData {
                            title: string;
                            url: string;
                        }
                        
                        function extractData(): ExtractedData {
                            return {
                                title: document.title,
                                url: window.location.href
                            };
                        }
                        return extractData();
                    `
                }
            };

            expect(customHandler.enabled).toBe(true);
            expect(customHandler.code.language).toBe("typescript");
            expect(customHandler.code.source).toBeDefined();
            expect(customHandler.code.source.includes("interface")).toBe(true);
        });
    });

    describe("JSON Schema Configuration", () => {
        it("should support JSON Schema configuration", () => {
            const jsonOptions = {
                schema: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Page Title" },
                        content: { type: "string", description: "Page Content" },
                        links: {
                            type: "array",
                            items: { type: "string" },
                            description: "Page Links"
                        }
                    },
                    required: ["title", "content"]
                },
                userPrompt: "Extract structured information from the page",
                schemaName: "PageData",
                schemaDescription: "Structured representation of page data"
            };

            expect(jsonOptions.schema).toBeDefined();
            expect(jsonOptions.schema.type).toBe("object");
            expect(jsonOptions.schema.properties).toBeDefined();
            expect(jsonOptions.schema.required).toBeInstanceOf(Array);
            expect(jsonOptions.userPrompt).toBeDefined();
            expect(jsonOptions.schemaName).toBeDefined();
            expect(jsonOptions.schemaDescription).toBeDefined();
        });
    });
});