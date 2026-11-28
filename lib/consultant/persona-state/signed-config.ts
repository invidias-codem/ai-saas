import crypto from "node:crypto";
import { z } from "zod";

// ── Environment Lock ─────────────────────────────────────────────────
export const DeploymentEnvironment = z.enum([
  "LOCAL_DAEMON",
  "CLOUD_INFRASTRUCTURE",
  "STAGING",
]);

// ── Timestamp Window ─────────────────────────────────────────────────
export const ConfigTimestampSchema = z.object({
  signedAt: z.string().datetime(),
  validityWindowSeconds: z.number().int().positive().max(86400),
});

// ── Namespace Whitelist ──────────────────────────────────────────────
export const NamespaceWhitelistSchema = z.object({
  allowedNamespaces: z.array(z.string().min(1)).min(1),
  forbiddenNamespaces: z.array(z.string().min(1)),
});

// ── Full Signed Config ───────────────────────────────────────────────
export const SignedConfigSchema = z.object({
  version: z.literal(1),
  environment: DeploymentEnvironment,
  timestamp: ConfigTimestampSchema,
  namespaces: NamespaceWhitelistSchema,
  signature: z.string().length(64),
}).strict();

export type SignedConfig = z.infer<typeof SignedConfigSchema>;

// ── Canonical Payload ────────────────────────────────────────────────
export function canonicalConfigPayload(
  config: Omit<SignedConfig, "signature">,
): string {
  const ts = config.timestamp;
  const ns = config.namespaces;

  return [
    `version=${config.version}`,
    `environment=${config.environment}`,
    `signedAt=${ts.signedAt}`,
    `validityWindowSeconds=${ts.validityWindowSeconds}`,
    `allowedNamespaces=${[...ns.allowedNamespaces].sort().join(",")}`,
    `forbiddenNamespaces=${[...ns.forbiddenNamespaces].sort().join(",")}`,
  ].join("&");
}

// ── Trusted Verification Keys ────────────────────────────────────────
export const TRUSTED_VERIFICATION_KEYS: string[] = [
  process.env.LATTICE_VERIFICATION_KEY_BASE64 ?? "",
];

export async function verifySignedConfig(
  config: SignedConfig,
): Promise<{ valid: boolean; reason?: string }> {
  if (TRUSTED_VERIFICATION_KEYS.length === 0) {
    return { valid: false, reason: "No verification keys configured" };
  }

  // 1. Check timestamp window
  const signedAt = new Date(config.timestamp.signedAt).getTime();
  const now = Date.now();
  const windowMs = config.timestamp.validityWindowSeconds * 1000;

  if (now < signedAt - windowMs || now > signedAt + windowMs) {
    return {
      valid: false,
      reason: `Config timestamp outside validity window: signedAt=${config.timestamp.signedAt}, window=${config.timestamp.validityWindowSeconds}s`,
    };
  }

  // 2. Verify environment binding
  const runtimeEnv = process.env.LATTICE_DEPLOYMENT_ENVIRONMENT ?? "LOCAL_DAEMON";
  if (config.environment !== runtimeEnv) {
    return {
      valid: false,
      reason: `Environment mismatch: config is for ${config.environment}, runtime is ${runtimeEnv}`,
    };
  }

  // 3. Reconstruct canonical payload and verify signature
  const { signature, ...payload } = config;
  const canonicalPayload = canonicalConfigPayload(payload);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = Buffer.from(signature, "hex");

  for (const keyBase64 of TRUSTED_VERIFICATION_KEYS) {
    if (!keyBase64) continue;
    const publicKeyBuffer = Buffer.from(keyBase64, "base64");
    try {
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        publicKeyBuffer,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      const verified = await crypto.subtle.verify(
        { name: "Ed25519" },
        cryptoKey,
        signatureBytes,
        payloadBytes,
      );
      if (verified) return { valid: true };
    } catch {
      // Try next key
    }
  }

  return { valid: false, reason: "Signature verification failed against all trusted keys" };
}
