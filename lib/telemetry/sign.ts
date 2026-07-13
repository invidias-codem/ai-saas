/**
 * Sovereign AI Telemetry — record signing.
 *
 * Two signing modes, both tamper-evident:
 *
 * 1. Hash chain (keyless, default fallback). Each record carries
 *    prev_record_hash + governance_signature = SHA-256(recordHash|prevHash).
 *    Detects silent mutation; no key needed.
 *
 * 2. Ed25519 (asymmetric, server-held key — Phase 3.2-b hardening). When
 *    TELEMETRY_SIGNING_KEY is configured, the flush endpoint signs each link
 *    with Ed25519 (RFC 8032-correct via @noble/ed25519 — runs in Node,
 *    browsers, and the Tauri webview). The stored governance_signature becomes
 *    an Ed25519 signature verifiable by any auditor holding the published
 *    public key — giving true signature authority, not just integrity linkage.
 */

import type { UdifInteractionAudit } from "./udif";

function getCrypto(): Crypto {
  const c = (globalThis as any).crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto (crypto.subtle) unavailable in this environment");
  }
  return c as Crypto;
}

/** Stable canonical JSON (sorted keys, no whitespace). */
export function canonicalize(record: unknown): string {
  return JSON.stringify(sortKeys(record));
}

function sortKeys(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeys(value[key]);
  }
  return out;
}

function toHex(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const c = getCrypto();
  const digest = await c.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

export interface SignedChain {
  prev_record_hash: string;
  governance_signature: string;
  /** Present only for Ed25519-signed links (mode 2). */
  signing_public_key?: string;
  /** "ed25519" | "hash-chain" — records which mode produced the signature. */
  sig_mode?: "ed25519" | "hash-chain";
}

// ── Hash-chain mode (keyless) ──────────────────────────────────────────────

/**
 * Sign a record for the chain. `prevHash` is the previous record's
 * governance_signature (or "root" for the first record in a chain).
 */
export async function signRecord(
  record: UdifInteractionAudit,
  prevHash: string
): Promise<SignedChain> {
  const recordHash = await sha256Hex(canonicalize(record));
  const governance_signature = await sha256Hex(`${recordHash}|${prevHash}`);
  return {
    prev_record_hash: prevHash,
    governance_signature,
    sig_mode: "hash-chain",
  };
}

/**
 * Verify a record's signature against the expected previous hash.
 * Returns true iff the chain link is intact (record unmutated).
 */
export async function verifyRecordSignature(
  record: UdifInteractionAudit,
  claimed: SignedChain,
  expectedPrevHash: string
): Promise<boolean> {
  if (claimed.prev_record_hash !== expectedPrevHash) return false;
  const recordHash = await sha256Hex(canonicalize(record));
  const recomputed = await sha256Hex(`${recordHash}|${claimed.prev_record_hash}`);
  return recomputed === claimed.governance_signature;
}

// ── Ed25519 mode (asymmetric, server-held key) ─────────────────────────────

import * as ed from "@noble/ed25519";

function toBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** The exact byte sequence signed/verified for a link (32-byte SHA-256). */
async function ed25519MessageBytes(
  record: UdifInteractionAudit,
  prevHash: string
): Promise<Uint8Array> {
  const recordHash = await sha256Hex(canonicalize(record));
  const message = await sha256Hex(`${recordHash}|${prevHash}`);
  return toBytes(message);
}

/** Generate a fresh Ed25519 private key (raw 32 bytes, hex). */
export function generateEd25519PrivateKeyHex(): string {
  return toHex(ed.utils.randomPrivateKey());
}

/** Derive the public key hex from a private key hex (RFC 8032). */
export async function publicKeyFromPrivateHex(privKeyHex: string): Promise<string> {
  const pub = await ed.getPublicKeyAsync(toBytes(privKeyHex));
  return toHex(pub);
}

/**
 * Sign a record link with Ed25519. The message is SHA-256(recordHash|prevHash),
 * signed by the server-held private key via @noble/ed25519 (RFC 8032-correct,
 * runs in Node/browser/Tauri). Produces a real asymmetric signature
 * verifiable by any holder of the matching public key.
 */
export async function signRecordEd25519(
  record: UdifInteractionAudit,
  prevHash: string,
  privateKeyHex: string
): Promise<SignedChain> {
  const msg = await ed25519MessageBytes(record, prevHash);
  const sig = await ed.signAsync(msg, toBytes(privateKeyHex));
  return {
    prev_record_hash: prevHash,
    governance_signature: toHex(sig),
    signing_public_key: await publicKeyFromPrivateHex(privateKeyHex),
    sig_mode: "ed25519",
  };
}

/**
 * Verify an Ed25519-signed link against the expected previous hash and the
 * publisher's public key. Returns true iff the signature is valid AND the
 * chain link is intact.
 */
export async function verifyRecordEd25519(
  record: UdifInteractionAudit,
  claimed: SignedChain,
  expectedPrevHash: string,
  publicKeyHex: string
): Promise<boolean> {
  if (claimed.prev_record_hash !== expectedPrevHash) return false;
  if (claimed.sig_mode !== "ed25519" || !claimed.signing_public_key) return false;
  const expectedPub = await publicKeyFromPrivateHex(publicKeyHex);
  if (
    claimed.signing_public_key !== expectedPub &&
    claimed.signing_public_key !== publicKeyHex
  ) {
    return false;
  }
  const msg = await ed25519MessageBytes(record, claimed.prev_record_hash);
  try {
    return await ed.verifyAsync(
      toBytes(claimed.governance_signature),
      msg,
      toBytes(expectedPub)
    );
  } catch {
    return false;
  }
}
