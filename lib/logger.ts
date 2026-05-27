
/**
 * Logger utility for consistent application logging.
 * Supports debug gating via DEBUG_LOGGING environment variable.
 */

const isDebug = process.env.DEBUG_LOGGING === 'true' || process.env.DEBUG_LLM === 'true';

export const logger = {
    debug: (message: string, ...args: any[]) => {
        if (isDebug) {
            console.debug("[DEBUG]", message, ...args);
        }
    },

    info: (message: string, ...args: any[]) => {
        console.log("[INFO]", message, ...args);
    },

    warn: (message: string, ...args: any[]) => {
        console.warn("[WARN]", message, ...args);
    },

    error: (message: string, error?: any, ...args: any[]) => {
        console.error("[ERROR]", message, error, ...args);
    },
};
