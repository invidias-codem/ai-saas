"use strict";
/**
 * Logger utility for consistent application logging.
 * Supports debug gating via DEBUG_LOGGING environment variable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const isDebug = process.env.DEBUG_LOGGING === 'true' || process.env.DEBUG_LLM === 'true';
exports.logger = {
    debug: (message, ...args) => {
        if (isDebug) {
            console.debug("[DEBUG]", message, ...args);
        }
    },
    info: (message, ...args) => {
        console.log("[INFO]", message, ...args);
    },
    warn: (message, ...args) => {
        console.warn("[WARN]", message, ...args);
    },
    error: (message, error, ...args) => {
        console.error("[ERROR]", message, error, ...args);
    },
};
