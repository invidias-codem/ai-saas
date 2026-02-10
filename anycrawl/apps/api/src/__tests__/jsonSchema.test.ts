import { describe, expect, it, beforeAll } from "@jest/globals";
import request from "supertest";

const BASE_URL = process.env.ANYCRAWL_BASE_URL || "http://127.0.0.1:8080";
const TIMEOUT = 30000;

describe("JSON Schema Validation (via API)", () => {
    beforeAll(() => {
        process.env.ANYCRAWL_API_AUTH_ENABLED = "false";
    });

    it("should accept valid simple object schema in scrape request", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            description: { type: "string" }
                        },
                        required: ["title"]
                    },
                    user_prompt: "Extract title and description"
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    }, TIMEOUT);

    it("should accept nested object schema", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "object",
                        properties: {
                            user: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    email: { type: "string" }
                                }
                            }
                        }
                    }
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    }, TIMEOUT);

    it("should reject invalid schema type", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "invalid_type", // Invalid type
                        properties: {
                            title: { type: "string" }
                        }
                    }
                }
            });

        // Should return validation error
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
    }, TIMEOUT);

    it("should reject invalid properties type", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "object",
                        properties: "invalid" // properties should be an object, not a string
                    }
                }
            });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
    }, TIMEOUT);

    it("should accept array schema", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "number" },
                                name: { type: "string" }
                            }
                        }
                    }
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    }, TIMEOUT);

    it("should accept complex nested schema", async () => {
        const response = await request(BASE_URL)
            .post("/v1/scrape")
            .timeout(TIMEOUT)
            .send({
                url: "https://example.com",
                engine: "cheerio",
                formats: ["json"],
                json_options: {
                    schema: {
                        type: "object",
                        properties: {
                            company_mission: { type: "string" },
                            is_open_source: {
                                type: "object",
                                properties: {
                                    value: { type: "boolean" },
                                    repo_url: { type: "string" }
                                }
                            },
                            employee_count: { type: "number" }
                        },
                        required: ["company_mission"]
                    }
                }
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    }, TIMEOUT);
});

