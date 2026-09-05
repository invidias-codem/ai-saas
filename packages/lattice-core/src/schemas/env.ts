/**
 * Canonical environment schema for Lattice OS.
 *
 * This is the single source of truth for env var names, types, and
 * validation rules. Import it instead of redefining per-file.
 */
import { z } from 'zod';

export const supportedProvidersSchema = z.enum(['google', 'openai', 'anthropic', 'deepseek', 'nvidia-nim']);
export type SupportedProvider = z.infer<typeof supportedProvidersSchema>;

export const envSchema = z.object({
  DEPLOYMENT_MODE: z.string().optional(),
  PREFLIGHT_SECRET: z.string().optional(),
  LATTICE_INSTANCE_ID: z.string().uuid().optional(),

  // Clerk keys (publicly exposed to browser)
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, { message: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required' })
    .optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL: z.string().min(1).optional(),

  // Clerk keys (server-side only)
  CLERK_SECRET_KEY: z
    .string()
    .min(1, { message: 'CLERK_SECRET_KEY is required' })
    .or(z.literal(''))
    .optional(),

  // Server-side AI keys
  // NOTE: These can be optional for offline scripts (dataset curation/eval harness).
  GOOGLE_API_KEY: z.string().min(1).optional(),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),
  REPLICATE_API_TOKEN_MUSIC: z.string().min(1).optional(),
  REPLICATE_API_TOKEN_VIDEO: z.string().min(1).optional(),

  // NVIDIA NIM (OpenAI-compatible inference)
  NVIDIA_API_KEY: z.string().min(1).optional(),
  NVIDIA_NIM_BASE_URL: z.string().url().optional().default('https://integrate.api.nvidia.com/v1'),

  // ADD THESE FOR VERTEX AI (IMAGEN)
  GOOGLE_PROJECT_ID: z
    .string()
    .min(1, { message: 'GOOGLE_PROJECT_ID is required' })
    .optional(),
  GOOGLE_LOCATION: z.string().min(1).default('us-central1'),

  GCP_SERVICE_ACCOUNT_KEY_JSON: z
    .string()
    .min(1, { message: 'GCP_SERVICE_ACCOUNT_KEY_JSON (raw JSON) is required for Google Cloud APIs' })
    .optional(),
  GCP_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),

  // RAG Memory Configuration
  NEXT_PUBLIC_RAG_ENABLED: z.string().optional().default('true'),
  RAG_CLOUD_FUNCTION_URL: z.string().optional(),
  RAG_MEMORY_RETENTION_DAYS: z.string().optional().default('90'),
  RAG_RETRIEVAL_LIMIT: z.string().optional().default('5'),
  RAG_SIMILARITY_THRESHOLD: z.string().optional().default('0.6'),

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
  NEXT_PUBLIC_SLACK_CLIENT_ID: z.string().optional(),

  // Cloudflare Turnstile (guest-chat anti-abuse).
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional().default('1x00000000000000000000AA'),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, { message: 'NEXT_PUBLIC_SUPABASE_URL is required' })
    .optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, { message: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required' })
    .optional(),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { message: 'SUPABASE_SERVICE_ROLE_KEY is required' })
    .optional(),

  // UCOL Error Resolution Agent — GitHub bot token (PAT with repo scope)
  GITHUB_AGENT_TOKEN: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),
  GITHUB_DEFAULT_BRANCH: z.string().optional().default('main'),
  VERCEL_LOG_WEBHOOK_SECRET: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  BLUESKY_POST_SECRET: z.string().optional(),

  // GitHub App — Context Engine (per-user installation flow)
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY_B64: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),

  // Inngest Cloud — Durable background execution
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Trigger.dev v3 — Durable sandbox execution + HITL waitpoints
  TRIGGER_SECRET_KEY: z.string().optional(),

  // Observability
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().optional().default('https://cloud.langfuse.com'),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),

  // Agentic routing
  LATTICE_AGENTIC_MODEL: z
    .preprocess((val) => (typeof val === 'string' && val.trim() === '' ? undefined : val), z.string().optional())
    .default('Hermes-4-70B'),
  NOUSE_API_KEY: z.string().optional(),
  NOUS_MODEL_ID: z.string().optional(),

  // NVIDIA NIM — local-first embedding
  LATTICE_NIM_MODE: z
    .enum(['local', 'cloud'])
    .optional()
    .default('local'),
  LATTICE_NIM_LOCAL_URL: z.string().url().optional().default('http://127.0.0.1:8000/v1'),
  LATTICE_NIM_CLOUD_URL: z.string().url().optional().default('https://integrate.api.nvidia.com/v1'),
  LATTICE_NIM_CLOUD_API_KEY: z.string().optional(),
  LATTICE_NIM_EMBED_MODEL: z.string().optional().default('nvidia/nv-embedqa-e5-v5'),
  LATTICE_NIM_EMBED_DIM: z.coerce.number().optional().default(1024),

  // Billing / Payment
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_EXPERT_PRICE_ID: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
}).superRefine((data, ctx) => {
  if (data.DEPLOYMENT_MODE === 'A') {
    const requiredModeAVars = [
      'PREFLIGHT_SECRET',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'GOOGLE_API_KEY',
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

export type Env = z.infer<typeof envSchema>;
