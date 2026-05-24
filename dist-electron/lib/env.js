"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
exports.requireEnv = requireEnv;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    // Clerk keys (publicly exposed to browser)
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: zod_1.z.string().min(1, { message: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required" }).optional(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: zod_1.z.string().min(1).optional(),
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: zod_1.z.string().min(1).optional(),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: zod_1.z.string().min(1).optional(),
    NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL: zod_1.z.string().min(1).optional(),
    // Clerk keys (server-side only)
    CLERK_SECRET_KEY: zod_1.z.string().min(1, { message: "CLERK_SECRET_KEY is required" }).or(zod_1.z.literal('')).optional(),
    // Server-side AI keys
    // NOTE: These can be optional for offline scripts (dataset curation/eval harness).
    GOOGLE_API_KEY: zod_1.z.string().min(1).optional(),
    REPLICATE_API_TOKEN: zod_1.z.string().min(1).optional(),
    REPLICATE_API_TOKEN_MUSIC: zod_1.z.string().min(1).optional(), // Added
    REPLICATE_API_TOKEN_VIDEO: zod_1.z.string().min(1).optional(), // Added
    // ADD THESE FOR VERTEX AI (IMAGEN)
    GOOGLE_PROJECT_ID: zod_1.z.string().min(1, { message: "GOOGLE_PROJECT_ID is required" }).optional(),
    GOOGLE_LOCATION: zod_1.z.string().min(1).default("us-central1"), // e.g., "us-central1"
    GCP_SERVICE_ACCOUNT_KEY_JSON: zod_1.z.string().min(1, { message: "GCP_SERVICE_ACCOUNT_KEY_JSON (raw JSON) is required for Google Cloud APIs" }).optional(),
    GCP_PROJECT_ID: zod_1.z.string().min(1).optional(),
    FIREBASE_PROJECT_ID: zod_1.z.string().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().min(1).optional(),
    FIREBASE_PRIVATE_KEY: zod_1.z.string().min(1).optional(),
    GOOGLE_APPLICATION_CREDENTIALS: zod_1.z.string().min(1).optional(),
    // RAG Memory Configuration
    NEXT_PUBLIC_RAG_ENABLED: zod_1.z.string().optional().default("true"),
    RAG_CLOUD_FUNCTION_URL: zod_1.z.string().optional(),
    RAG_MEMORY_RETENTION_DAYS: zod_1.z.string().optional().default("90"),
    RAG_RETRIEVAL_LIMIT: zod_1.z.string().optional().default("5"),
    RAG_SIMILARITY_THRESHOLD: zod_1.z.string().optional().default("0.6"),
    // Zapier Integration
    ZAPIER_CLIENT_ID: zod_1.z.string().optional(),
    ZAPIER_CLIENT_SECRET: zod_1.z.string().optional(),
    ZAPIER_API_KEY: zod_1.z.string().optional(),
    // Slack Integration
    SLACK_BOT_TOKEN: zod_1.z.string().optional(),
    SLACK_SIGNING_SECRET: zod_1.z.string().optional(),
    SLACK_APP_ID: zod_1.z.string().optional(),
    SLACK_CLIENT_ID: zod_1.z.string().optional(),
    SLACK_CLIENT_SECRET: zod_1.z.string().optional(),
    NEXT_PUBLIC_SLACK_CLIENT_ID: zod_1.z.string().optional(), // For client-side Add to Slack button
    // Supabase
    // NOTE: optional for offline eval runs; required for dataset curation and runtime features.
    NEXT_PUBLIC_SUPABASE_URL: zod_1.z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_URL is required" }).optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: zod_1.z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }).optional(),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1, { message: "SUPABASE_SERVICE_ROLE_KEY is required" }).optional(),
    // UCOL Error Resolution Agent — GitHub bot token (PAT with repo scope)
    // Used by the autonomous error resolution agent to search code, create branches, and open PRs.
    // Generate at: https://github.com/settings/tokens → "repo" scope
    GITHUB_AGENT_TOKEN: zod_1.z.string().optional(),
    GITHUB_REPO_OWNER: zod_1.z.string().optional(),
    GITHUB_REPO_NAME: zod_1.z.string().optional(),
    GITHUB_DEFAULT_BRANCH: zod_1.z.string().optional().default('main'),
    VERCEL_LOG_WEBHOOK_SECRET: zod_1.z.string().optional(),
    CLERK_WEBHOOK_SECRET: zod_1.z.string().optional(),
    CRON_SECRET: zod_1.z.string().optional(),
});
// Parse the environment variables and export the result
exports.env = envSchema.parse(process.env);
/**
 * Require a specific env var at runtime.
 *
 * Useful when envSchema allows optional keys (to support offline scripts),
 * but application code needs a hard requirement.
 */
function requireEnv(key) {
    const value = exports.env[key];
    if (value == null || (typeof value === 'string' && value.length === 0)) {
        throw new Error(`${String(key)} is required`);
    }
    return value;
}
