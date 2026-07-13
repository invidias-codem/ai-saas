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
const STRONGHOLD_CLIENT = "telemetry-client";

/** Resolve the optional client Ed25519 private key hex, or null. */
export async function resolveSigningKeyHex(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_TELEMETRY_SIGNING_KEY) {
    return process.env.NEXT_PUBLIC_TELEMETRY_SIGNING_KEY;
  }
  if (typeof window === "undefined") return null;
  if (!("__TAURI_INTERNALS__" in window || "__TAURI_IPC__" in window)) return null;
  try {
    const { Stronghold } = await import("@tauri-apps/plugin-stronghold");
    const stronghold = await Stronghold.load(STRONGHOLD_PATH, "telemetry");
    // Load an existing client, or create it on first run.
    let client;
    try {
      client = await stronghold.loadClient(STRONGHOLD_CLIENT);
    } catch {
      client = await stronghold.createClient(STRONGHOLD_CLIENT);
    }
    const store = client.getStore();
    const stored = await store.get(STRONGHOLD_KEY);
    if (stored) return new TextDecoder().decode(stored);
    // Generate + persist a fresh key on first run.
    const fresh = generateEd25519PrivateKeyHex();
    await store.insert(STRONGHOLD_KEY, Array.from(new TextEncoder().encode(fresh)));
    await stronghold.save();
    return fresh;
  } catch {
    return null;
  }
}
