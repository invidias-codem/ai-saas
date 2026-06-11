import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { githubRepoSync } from "@/lib/inngest/functions/github-repo-sync";

/**
 * Inngest serve handler for Lattice OS.
 *
 * This route is the bridge between Inngest Cloud and our Next.js deployment.
 * Inngest Cloud calls this endpoint to:
 *   - Discover registered functions (GET, on deploy)
 *   - Dispatch step execution requests (POST, during a run)
 *
 * The INNGEST_SIGNING_KEY env var is used by the SDK to verify that incoming
 * POST requests are genuinely from Inngest Cloud, not a third party.
 *
 * To test locally: start `npx inngest-cli@latest dev` alongside `pnpm dev`.
 * The Inngest Dev Server will auto-discover this endpoint.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    githubRepoSync,
    // Add future Inngest functions here
  ],
});
