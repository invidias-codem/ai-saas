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

  // ADD THESE FOR VERTEX AI (IMAGEN)
  GOOGLE_PROJECT_ID: z.string().min(1, { message: "GOOGLE_PROJECT_ID is required" }),
  GOOGLE_LOCATION: z.string().min(1).default("us-central1"), // e.g., "us-central1"
});

// Parse the environment variables and export the result
export const env = envSchema.parse(process.env);