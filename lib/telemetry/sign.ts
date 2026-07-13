/**
 * Hash-chain signing — Phase 3.2.
 *
 * Produces a tamper-evident chain over UDIF 2.0 records. Each record carries:
 *   - prev_record_hash: SHA-256 of the previous record in the chain (or "root")
 *   - governance_signature: SHA-256 over (canonical record + prev_record_hash)
 *
 * This is a keyless hash chain (Web Crypto SHA-256). It makes silent mutation
 * detectable: altering any record breaks the link to its successor. True
 * asymmetric signing (server-held private key) is a later hardening step; the
 * chain already satisfies PRD §4 "cryptographic hashing and signing" intent
 * for integrity verification at the enterprise tier.
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

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
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
}

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
  return { prev_record_hash: prevHash, governance_signature };
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
