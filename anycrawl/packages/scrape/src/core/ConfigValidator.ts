import { EngineOptions } from "../types/engine.js";

/**
 * Configuration validator for engine options
 * Separates validation logic from the main engine class
 */
export class ConfigValidator {
    /**
     * Validate engine options
     * @param options The engine options to validate
     * @throws Error if validation fails
     */
    static validate(options: EngineOptions): void {
        this.validateConcurrency(options);
        this.validateTimeouts(options);
        this.validateRetrySettings(options);
        this.validateSessionSettings(options);
        this.validateQueueSettings(options);
    }

    private static validateConcurrency(options: EngineOptions): void {
        if (options.minConcurrency !== undefined && options.minConcurrency < 1) {
            throw new Error("EngineOptions validation failed: minConcurrency must be at least 1");
        }

        if (options.maxConcurrency !== undefined && options.maxConcurrency < 1) {
            throw new Error("EngineOptions validation failed: maxConcurrency must be at least 1");
        }

        if (options.minConcurrency !== undefined &&
            options.maxConcurrency !== undefined &&
            options.minConcurrency > options.maxConcurrency) {
            throw new Error("EngineOptions validation failed: minConcurrency cannot be greater than maxConcurrency");
        }
    }

    private static validateTimeouts(options: EngineOptions): void {
        if (options.requestHandlerTimeoutSecs !== undefined && options.requestHandlerTimeoutSecs < 1) {
            throw new Error("EngineOptions validation failed: requestHandlerTimeoutSecs must be at least 1");
        }

        if (options.maxRequestTimeout !== undefined && options.maxRequestTimeout < 1) {
            throw new Error("EngineOptions validation failed: maxRequestTimeout must be at least 1");
        }

        if (options.navigationTimeoutSecs !== undefined && options.navigationTimeoutSecs < 1) {
            throw new Error("EngineOptions validation failed: navigationTimeoutSecs must be at least 1");
        }
    }

    private static validateRetrySettings(options: EngineOptions): void {
        if (options.maxRequestRetries !== undefined && options.maxRequestRetries < 0) {
            throw new Error("EngineOptions validation failed: maxRequestRetries cannot be negative");
        }

        if (options.maxRequestsPerCrawl !== undefined && options.maxRequestsPerCrawl < 1) {
            throw new Error("EngineOptions validation failed: maxRequestsPerCrawl must be at least 1");
        }
    }

    private static validateSessionSettings(options: EngineOptions): void {
        if (options.maxSessionRotations !== undefined && options.maxSessionRotations < 0) {
            throw new Error("EngineOptions validation failed: maxSessionRotations cannot be negative");
        }
    }

    private static validateQueueSettings(options: EngineOptions): void {
        if (options.requestQueueName !== undefined && typeof options.requestQueueName !== 'string') {
            throw new Error("EngineOptions validation failed: requestQueueName must be a string");
        }
    }
}