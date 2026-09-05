import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev v3 project configuration for Lattice OS.
 *
 * Trigger.dev runs persistent background tasks in its own cloud runtime,
 * independent of the Next.js serverless lifecycle — this is what lets us
 * bypass Vercel's function timeout for multi-step agent loops, sandboxed code
 * execution, and human-in-the-loop (HITL) waitpoints.
 *
 * Env: TRIGGER_SECRET_KEY (server-only, signs the webhook) is read from .env
 * and provided by the Trigger.dev dashboard after `trigger.dev login`.
 */
export default defineConfig({
  project: "proj_nrmfrudcizidgnsdgzox",
  dirs: ["./src/trigger"],
  maxDuration: 900,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 60_000,
      randomize: true,
    },
  },
});