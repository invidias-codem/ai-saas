import { describe, expect, it } from "@jest/globals";
import request from "supertest";

const TEST_URL = "http://127.0.0.1:8080";
const TIMEOUT = 30000; // 30 seconds

describe("Scrape API", () => {
    beforeAll(() => {
        process.env.ANYCRAWL_API_AUTH_ENABLED = "false";
    });

    it("health check", async () => {
        const response = await request(TEST_URL).get("/");
        expect(response.status).toBe(200);
        expect(response.text).toBe("Hello World");
    });

    it("should return failed when 403 forbidden", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://httpstat.us/403",
            engine: "cheerio",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("failed");
        expect(response.body.data.error.toLowerCase()).toContain("request blocked");
    }, 10000);
    it("should return success when 200 ok with cheerio", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://example.com",
            engine: "cheerio",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("completed");
        expect(response.body.data.html.toLowerCase()).toContain("200 ok");
    }, 10000);

    it("should return success when 200 ok with playwright", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://example.com/",
            engine: "playwright",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("completed");
        expect(response.body.data.html.toLowerCase()).toContain("200 ok");
    }, 10000);
    it("should return success when 200 ok with puppeteer", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://example.com/",
            engine: "puppeteer",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("completed");
        expect(response.body.data.html.toLowerCase()).toContain("200 ok");
    });

    it("should return success when 404 not found", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://httpstat.us/404",
            engine: "cheerio",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe("completed");
        expect(response.body.data.html.toLowerCase()).toContain("404 not found");
    });

    it("should return success when 200 ok with cheerio and expired ssl", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://expired.badssl.com/",
            engine: "cheerio",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        if (process.env.ANYCRAWL_IGNORE_SSL_ERROR === "true") {
            expect(response.body.data.status).toBe("completed");
            expect(response.body.data.html.toLowerCase()).toContain("expired");
        } else {
            expect(response.body.data.status).toBe("failed");
            expect(response.body.data.error.toLowerCase()).toContain("ssl");
        }
    });
    it("should return success when 200 ok with playwright and expired ssl", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://expired.badssl.com/",
            engine: "playwright",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        if (process.env.ANYCRAWL_IGNORE_SSL_ERROR === "true") {
            expect(response.body.data.status).toBe("completed");
            expect(response.body.data.html.toLowerCase()).toContain("expired");
        } else {
            expect(response.body.data.status).toBe("failed");
            expect(response.body.data.error.toLowerCase()).toContain("ssl");
        }
    });
    it("should return success when 200 ok with puppeteer and expired ssl", async () => {
        const response = await request(TEST_URL).post("/v1/scrape").timeout(TIMEOUT).send({
            url: "https://expired.badssl.com/",
            engine: "puppeteer",
        });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        if (process.env.ANYCRAWL_IGNORE_SSL_ERROR === "true") {
            expect(response.body.data.status).toBe("completed");
            expect(response.body.data.html.toLowerCase()).toContain("expired");
        } else {
            expect(response.body.data.status).toBe("failed");
            expect(response.body.data.error.toLowerCase()).toContain("ssl");
        }
    });
});
