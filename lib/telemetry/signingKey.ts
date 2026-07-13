/**
 * Client signing-key resolution — Phase 4 (Tauri).
 *
 * Resolves an optional Ed25519 private key the native client may use to
 * pre-sign telemetry records before flushing. Priority:
 *   1. NEXT_PUBLIC_TELEMETRY_SIGNING_KEY (browser/build-time)
 *   2. Stronghold vault (Tauri desktop shell) — generated + persisted on first run
 *   3. null (no client key; server remains the authoritative signer)
 *
 * All failures degrade to null — the client signing key is strictly optional.
 */

"use client";

import { generateEd25519PrivateKeyHex } from "./sign";

const STRONGHOLD_KEY = "telemetry_signing_key";
const STRONGHOLD_PATH = ".lattice_telemetry";

/** Resolve the optional client Ed25519 private key hex, or null. */
export async function resolveSigningKeyHex(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_TELEMETRY_SIGNING_KEY) {
    return process.env.NEXT_PUBLIC_TELEMETRY_SIGNING_KEY;
  }
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)) return null;
  try {
    const { load } = await import("@tauri-apps/plugin-stronghold");
    const vault = await load(STRONGHOLD_PATH, { password: "telemetry" });
    const stored = vault.get(STRONGHOLD_KEY);
    if (stored) return stored as string;
    // Generate + persist a fresh key on first run.
    const fresh = generateEd25519PrivateKeyHex();
    vault.set(STRONGHOLD_KEY, fresh);
    await vault.save();
    return fresh;
  } catch {
    return null;
  }
}
