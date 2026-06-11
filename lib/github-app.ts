import { App } from "@octokit/app";
import { requireEnv } from "@/lib/env";

let _app: App | null = null;

/**
 * Lazily instantiates the GitHub App singleton.
 * Reads credentials from env at call-time so Next.js can tree-shake this
 * module safely — it will never run on the client.
 *
 * The private key is stored base64-encoded in the env var to avoid newline
 * issues with Vercel + Turbopack (raw PEM multiline strings break env parsing).
 * Encode with: base64 -i private-key.pem | tr -d '\n' > private-key.b64
 */
function getApp(): App {
  if (_app) return _app;

  const appId = requireEnv("GITHUB_APP_ID");
  const privateKeyB64 = requireEnv("GITHUB_APP_PRIVATE_KEY_B64");
  const webhookSecret = requireEnv("GITHUB_APP_WEBHOOK_SECRET");

  // Decode base64 → PEM string (restore newlines stripped for env storage)
  const privateKey = Buffer.from(privateKeyB64, "base64").toString("utf-8");

  _app = new App({
    appId,
    privateKey,
    webhooks: { secret: webhookSecret },
  });

  return _app;
}

/**
 * Returns an Octokit instance authenticated as the GitHub App installation.
 * This mints a short-lived (1h) Installation Access Token scoped exactly to
 * the repositories the user granted access to — not their entire account.
 *
 * @param installationId  The `installation_id` returned during the OAuth callback.
 */
export async function getInstallationOctokit(installationId: number) {
  const app = getApp();
  return app.getInstallationOctokit(installationId);
}

/**
 * Returns an App-level Octokit instance.
 * Used for listing installations or validating App-level API calls.
 */
export function getAppOctokit() {
  const app = getApp();
  return app.octokit;
}

/**
 * Generates the URL the user must visit to install the GitHub App on their
 * repositories. Optionally scopes to a specific repo via `repository` param.
 *
 * @param state  CSRF token — store in session before redirecting, verify in callback.
 */
export function getInstallationUrl(state: string): string {
  const clientId = requireEnv("GITHUB_APP_CLIENT_ID");
  const params = new URLSearchParams({ state });
  // GitHub App installation URL format
  return `https://github.com/apps/lattice-os/installations/new?${params}`;
}
