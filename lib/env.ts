import { z } from "zod";



const envSchema = z.object({
  DEPLOYMENT_MODE: z.string().optional(),
  PREFLIGHT_SECRET: z.string().optional(),
  LATTICE_INSTANCE_ID: z.string().uuid().optional(),

  // Clerk keys (publicly exposed to browser)
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, { message: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required" }).optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL: z.string().min(1).optional(),

  // Clerk keys (server-side only)
  CLERK_SECRET_KEY: z.string().min(1, { message: "CLERK_SECRET_KEY is required" }).or(z.literal('')).optional(),

  // Server-side AI keys
  // NOTE: These can be optional for offline scripts (dataset curation/eval harness).
  GOOGLE_API_KEY: z.string().min(1).optional(),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),
  REPLICATE_API_TOKEN_MUSIC: z.string().min(1).optional(), // Added
  REPLICATE_API_TOKEN_VIDEO: z.string().min(1).optional(), // Added

  // ADD THESE FOR VERTEX AI (IMAGEN)
  GOOGLE_PROJECT_ID: z.string().min(1, { message: "GOOGLE_PROJECT_ID is required" }).optional(),
  GOOGLE_LOCATION: z.string().min(1).default("us-central1"), // e.g., "us-central1"

  GCP_SERVICE_ACCOUNT_KEY_JSON: z.string().min(1, { message: "GCP_SERVICE_ACCOUNT_KEY_JSON (raw JSON) is required for Google Cloud APIs" }).optional(),
  GCP_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),

  // RAG Memory Configuration
  NEXT_PUBLIC_RAG_ENABLED: z.string().optional().default("true"),
  RAG_CLOUD_FUNCTION_URL: z.string().optional(),
  RAG_MEMORY_RETENTION_DAYS: z.string().optional().default("90"),
  RAG_RETRIEVAL_LIMIT: z.string().optional().default("5"),
  RAG_SIMILARITY_THRESHOLD: z.string().optional().default("0.6"),

  // Zapier Integration
  ZAPIER_CLIENT_ID: z.string().optional(),
  ZAPIER_CLIENT_SECRET: z.string().optional(),
  ZAPIER_API_KEY: z.string().optional(),

  // Slack Integration
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_APP_ID: z.string().optional(),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  NEXT_PUBLIC_SLACK_CLIENT_ID: z.string().optional(), // For client-side Add to Slack button

  // Cloudflare Turnstile (guest-chat anti-abuse).
  // Public site key is exposed to the browser; secret key (TURNSTILE_SECRET_KEY) stays server-side.
  // Defaults to Cloudflare's documented "always passes" test key so the guest funnel works
  // out-of-the-box in dev/preview. Override with a real key in production.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional().default("1x00000000000000000000AA"),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Supabase
  // NOTE: optional for offline eval runs; required for dataset curation and runtime features.
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_URL is required" }).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { message: "SUPABASE_SERVICE_ROLE_KEY is required" }).optional(),

  // UCOL Error Resolution Agent — GitHub bot token (PAT with repo scope)
  // Used by the autonomous error resolution agent to search code, create branches, and open PRs.
  // Generate at: https://github.com/settings/tokens → "repo" scope
  GITHUB_AGENT_TOKEN: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),
  GITHUB_DEFAULT_BRANCH: z.string().optional().default('main'),
  VERCEL_LOG_WEBHOOK_SECRET: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  BLUESKY_POST_SECRET: z.string().optional(),

  // GitHub App — Context Engine (per-user installation flow)
  // Register at: https://github.com/settings/apps
  // Private key must be base64-encoded (no raw newlines) for Vercel + Turbopack compatibility.
  // e.g.: base64 -i private-key.pem | tr -d '\n' > private-key.b64
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_B64: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),

  // Inngest Cloud — Durable background execution
  // INNGEST_EVENT_KEY:   Used by the server to push events into the Inngest Cloud queue.
  // INNGEST_SIGNING_KEY: Used by /api/inngest to verify requests come from Inngest Cloud.
  // Generate both at: https://app.inngest.com → your environment → "Manage" → "Event keys" / "Signing key"
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.DEPLOYMENT_MODE === "A") {
    const requiredModeAVars = [
      "PREFLIGHT_SECRET",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_API_KEY", // Assuming Gemini is the baseline provider
    ] as const;

    for (const key of requiredModeAVars) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `[Mode A Requirement] Missing required environment variable: ${key}`,
          path: [key],
        });
      }
    }
  }
});

// Parse the environment variables and export the result
export const env = envSchema.parse(process.env);


/**
 * Require a specific env var at runtime.
 *
 * Useful when envSchema allows optional keys (to support offline scripts),
 * but application code needs a hard requirement.
 */
export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value == null || (typeof value === 'string' && value.length === 0)) {
    throw new Error(`${String(key)} is required`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
