import { ConfigValidator } from "../../core/ConfigValidator.js";
import type { EngineOptions } from "../../types/engine.js";

describe("ConfigValidator", () => {
    describe("validate", () => {
        test("should validate correct engine options", () => {
            const options: EngineOptions = {
                minConcurrency: 1,
                maxConcurrency: 10,
                maxRequestRetries: 3,
                requestHandlerTimeoutSecs: 30,
                maxRequestsPerCrawl: 1000,
                maxRequestTimeout: 30000,
                navigationTimeoutSecs: 30,
                maxSessionRotations: 5,
                requestQueueName: "test-queue"
            };

            expect(() => ConfigValidator.validate(options)).not.toThrow();
        });

        test("should validate empty options", () => {
            const options: EngineOptions = {};
            expect(() => ConfigValidator.validate(options)).not.toThrow();
        });

        test("should throw error for invalid minConcurrency", () => {
            const options: EngineOptions = {
                minConcurrency: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("minConcurrency must be at least 1");
        });

        test("should throw error for invalid maxConcurrency", () => {
            const options: EngineOptions = {
                maxConcurrency: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("maxConcurrency must be at least 1");
        });

        test("should throw error when minConcurrency > maxConcurrency", () => {
            const options: EngineOptions = {
                minConcurrency: 10,
                maxConcurrency: 5
            };
            expect(() => ConfigValidator.validate(options)).toThrow("minConcurrency cannot be greater than maxConcurrency");
        });

        test("should throw error for invalid requestHandlerTimeoutSecs", () => {
            const options: EngineOptions = {
                requestHandlerTimeoutSecs: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("requestHandlerTimeoutSecs must be at least 1");
        });

        test("should throw error for invalid maxRequestTimeout", () => {
            const options: EngineOptions = {
                maxRequestTimeout: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("maxRequestTimeout must be at least 1");
        });

        test("should throw error for invalid navigationTimeoutSecs", () => {
            const options: EngineOptions = {
                navigationTimeoutSecs: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("navigationTimeoutSecs must be at least 1");
        });

        test("should throw error for negative maxRequestRetries", () => {
            const options: EngineOptions = {
                maxRequestRetries: -1
            };
            expect(() => ConfigValidator.validate(options)).toThrow("maxRequestRetries cannot be negative");
        });

        test("should throw error for invalid maxRequestsPerCrawl", () => {
            const options: EngineOptions = {
                maxRequestsPerCrawl: 0
            };
            expect(() => ConfigValidator.validate(options)).toThrow("maxRequestsPerCrawl must be at least 1");
        });

        test("should throw error for negative maxSessionRotations", () => {
            const options: EngineOptions = {
                maxSessionRotations: -1
            };
            expect(() => ConfigValidator.validate(options)).toThrow("maxSessionRotations cannot be negative");
        });

        test("should throw error for invalid requestQueueName type", () => {
            const options: EngineOptions = {
                requestQueueName: 123 as any
            };
            expect(() => ConfigValidator.validate(options)).toThrow("requestQueueName must be a string");
        });

        test("should allow zero maxRequestRetries", () => {
            const options: EngineOptions = {
                maxRequestRetries: 0
            };
            expect(() => ConfigValidator.validate(options)).not.toThrow();
        });

        test("should allow zero maxSessionRotations", () => {
            const options: EngineOptions = {
                maxSessionRotations: 0
            };
            expect(() => ConfigValidator.validate(options)).not.toThrow();
        });
    });
});