/**
 * Native (Tauri) telemetry integration — Phase 4.
 *
 * The Sovereign AI Telemetry ledger + flush already work in any browser via
 * the Service Worker (Phase 2) and the /api/telemetry/flush endpoint (Phase 3).
 * In the Tauri desktop shell this module provides the same capability without
 * depending on a registered Service Worker, and reports the client signing
 * mode. The server remains the authoritative signer (Phase 3.2-b), so the
 * native client simply flushes the local ledger via the standard endpoint.
 */

"use client";

import { flushClientLedger } from "./flush";
import { resolveSigningKeyHex } from "./signingKey";
import type { UdifInteractionAudit } from "./udif";

export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window);

/**
 * Flush the local telemetry ledger to the enterprise instance. Works in both
 * the browser (SW-backed IndexedDB) and the Tauri desktop shell. Non-blocking;
 * never throws. Returns attempted/sent/failed counts plus the signing mode.
 */
export async function flushNativeTelemetry(options?: {
  clearOnSuccess?: boolean;
}): Promise<{ attempted: number; sent: number; failed: number; mode: string }> {
  const key = await resolveSigningKeyHex();
  const res = await flushClientLedger(options);
  return {
    attempted: res.attempted,
    sent: res.sent,
    failed: res.failed,
    mode: key ? "ed25519-client" : "hash-chain",
  };
}

/** Client public key (if a client signing key is configured), else null. */
export async function clientPublicKeyHex(): Promise<string | null> {
  const key = await resolveSigningKeyHex();
  if (!key) return null;
  const { publicKeyFromPrivateHex } = await import("./sign");
  return publicKeyFromPrivateHex(key);
}

/** Verify a record's client signature (used by auditors / dashboard). */
export async function verifyNativeSignature(
  record: UdifInteractionAudit,
  link: { prev_record_hash: string; governance_signature: string; signing_public_key: string },
  publicKeyHex: string
): Promise<boolean> {
  const { verifyRecordEd25519 } = await import("./sign");
  return verifyRecordEd25519(
    record,
    link as any,
    link.prev_record_hash,
    publicKeyHex
  );
}
