// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  // Clerk keys (publicly exposed to browser)
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, { message: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required" }),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().min(1),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL: z.string().min(1),

  // Clerk keys (server-side only)
  CLERK_SECRET_KEY: z.string().min(1, { message: "CLERK_SECRET_KEY is required" }),

  // Server-side AI keys
  GOOGLE_API_KEY: z.string().min(1),
  REPLICATE_API_TOKEN: z.string().min(1),
  REPLICATE_API_TOKEN_MUSIC: z.string().min(1), // Added
  REPLICATE_API_TOKEN_VIDEO: z.string().min(1), // Added

  // ADD THESE FOR VERTEX AI (IMAGEN)
  GOOGLE_PROJECT_ID: z.string().min(1, { message: "GOOGLE_PROJECT_ID is required" }),
  GOOGLE_LOCATION: z.string().min(1).default("us-central1"), // e.g., "us-central1"

  GCP_SERVICE_ACCOUNT_KEY_JSON: z.string().min(1, { message: "GCP_SERVICE_ACCOUNT_KEY_JSON (raw JSON) is required for Google Cloud APIs" }),

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

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_URL is required" }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, { message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required" }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, { message: "SUPABASE_SERVICE_ROLE_KEY is required" }),
});

// Parse the environment variables and export the result
export const env = envSchema.parse(process.env);