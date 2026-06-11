import { Inngest } from "inngest";

/**
 * Inngest client singleton for Lattice OS.
 *
 * The `id` field is the App ID registered in Inngest Cloud. It must be stable
 * across deployments — changing it severs the link to existing function history.
 *
 * Keys are read from process.env directly here (not via requireEnv) because this
 * module is imported at the module level during server startup. The actual key
 * values are only validated at runtime when events are sent or the serve handler
 * is hit, at which point Inngest's SDK surfaces configuration errors clearly.
 */
export const inngest = new Inngest({
  id: "lattice-os",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

/**
 * Canonical event schemas for Lattice OS → Inngest.
 * Import these types when sending events so callers get full type safety.
 */
export type GitHubRepoSyncEvent = {
  name: "github/repo.sync";
  data: {
    /** GitHub App installation ID — used to mint an Installation Access Token. */
    installationId: number;
    /** Repository owner login (user or org). */
    owner: string;
    /** Repository name (without owner prefix). */
    repo: string;
    /** Clerk user_id who owns this installation. */
    userId: string;
    /** How the sync was triggered — determines logging and rate limit strategy. */
    triggeredBy: "manual" | "push";
    /** Git commit SHA for push-triggered syncs — stored in github_repo_syncs. */
    commitSha?: string;
  };
};
