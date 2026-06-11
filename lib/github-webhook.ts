import { createHmac, timingSafeEqual } from "crypto";
import { requireEnv } from "@/lib/env";

export class WebhookSignatureError extends Error {
  readonly statusCode = 401;
  constructor(reason: string) {
    super(`GitHub webhook signature verification failed: ${reason}`);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verifies the `x-hub-signature-256` header on an incoming GitHub webhook
 * request using HMAC-SHA256 and a constant-time comparison.
 *
 * **App Router usage:**
 * ```ts
 * const rawBody = await request.text();
 * const sig = request.headers.get("x-hub-signature-256") ?? "";
 * verifyGitHubWebhookSignature(rawBody, sig); // throws WebhookSignatureError on failure
 * ```
 *
 * **Threat model:** Without this check, any actor can POST to your webhook
 * endpoint and trigger expensive Inngest runs (repo ingestion, embedding generation).
 * The GITHUB_APP_WEBHOOK_SECRET is set when you create the GitHub App and must
 * match the secret configured in the portal.
 *
 * @param rawBody    The raw request body as a string (use `await request.text()`).
 * @param signature  The `x-hub-signature-256` header value from GitHub.
 * @throws {WebhookSignatureError} If the signature is missing or does not match.
 */
export function verifyGitHubWebhookSignature(
  rawBody: string,
  signature: string | null
): void {
  if (!signature) {
    throw new WebhookSignatureError("missing x-hub-signature-256 header");
  }

  const secret = requireEnv("GITHUB_APP_WEBHOOK_SECRET");

  // GitHub sends "sha256=<hex>" — strip the algorithm prefix
  const sigHex = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const expectedHmac = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const sigBuffer = Buffer.from(sigHex, "hex");
  const expectedBuffer = Buffer.from(expectedHmac, "hex");

  // Constant-time comparison — prevents timing oracle attacks
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new WebhookSignatureError("HMAC-SHA256 digest does not match");
  }
}
