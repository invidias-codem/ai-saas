import { describe, expect, it } from "@jest/globals";
import request from "supertest";

const TEST_URL = "http://127.0.0.1:8080";

describe("Search API", () => {
    it("should return validation error when search engine is invalid", async () => {
        const response = await request(TEST_URL).post("/v1/search").send({
            query: "keyword",
            engine: "invalid-engine",
        });
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe("Validation error");
        expect(response.body.details).toBeDefined();
        expect(response.body.details.issues).toBeInstanceOf(Array);
        expect(response.body.details.issues[0]).toMatchObject({
            field: "engine",
            code: "invalid_enum_value",
        });
    });
    it("should return empty result when query is empty", async () => {
        const response = await request(TEST_URL).post("/v1/search").send({
            query: "",
            engine: "google",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.length).toBe(0);
    });

    it("should use google when engine is not provided", async () => {
        const response = await request(TEST_URL).post("/v1/search").send({
            query: "keyword",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(JSON.stringify(response.body.data).toLowerCase().includes("google")).toBe(true);
    });

    it("should check lang and country is valid", async () => {
        const response = await request(TEST_URL).post("/v1/search").send({
            query: "keyword",
            lang: "en",
            country: "US",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.length).toBeGreaterThan(0);
    });
    it("should check lang and country is invalid", async () => {
        const response = await request(TEST_URL).post("/v1/search").send({
            query: "keyword",
            lang: "en",
            country: "invalid-country",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);

        const response2 = await request(TEST_URL).post("/v1/search").send({
            query: "keyword",
            lang: "invalid-lang",
            country: "US",
        });
        expect(response2.status).toBe(200);
        expect(response2.body.success).toBe(true);
        expect(response2.body.data).toBeInstanceOf(Array);
        expect(response2.body.data.length).toBeGreaterThan(0);
    });
});
