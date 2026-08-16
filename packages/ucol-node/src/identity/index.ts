/**
 * @file identity/index.ts
 * @description UCOL Node identity — DID generation, Ed25519 keypair, sign/verify.
 *
 * DID format: did:ucol:node:<bs58-encoded-pubkey>
 * Signatures are base64url-encoded 64-byte Ed25519 signatures.
 */

import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import { DID, Signature } from '../store/schema.js';

// noble/ed25519 v1 requires sha512Sync to be set on utils
import { createHash } from 'crypto';

// Support both v1 (ed.utils.sha512Sync) and v2 (ed.etc.sha512Sync)
const sha512Sync = (...msgs: Uint8Array[]): Uint8Array => {
  const combined = Buffer.concat(msgs);
  return createHash('sha512').update(combined).digest();
};
 
const edAny = ed as any;
if (edAny.utils) edAny.utils.sha512Sync = sha512Sync;
if (edAny.etc) edAny.etc.sha512Sync = sha512Sync;

/**
 * Ed25519 keypair
 */
export interface KeyPair {
  /** 32-byte Ed25519 public key */
  publicKey: Uint8Array;
  /** 64-byte Ed25519 private key (seed + public) */
  privateKey: Uint8Array;
}

/**
 * Generate a new random Ed25519 keypair and derive the UCOL node DID.
 *
 * @returns KeyPair with publicKey (32 bytes) and privateKey (64 bytes)
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // noble/ed25519 private key is the 32-byte seed; public key is 32 bytes
  const privKey = ed.utils.randomPrivateKey();
  const pubKey = ed.sync.getPublicKey(privKey);
  return {
    publicKey: pubKey,
    privateKey: privKey,
  };
}

/**
 * Derive the UCOL NodeID DID from a public key.
 *
 * Format: `did:ucol:node:<base58-encoded-pubkey>`
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @returns DID string
 */
export function deriveDID(publicKey: Uint8Array): DID {
  const encoded = bs58.encode(publicKey);
  return `did:ucol:node:${encoded}`;
}

/**
 * Derive an AgentID DID (without "node:" prefix) from a public key.
 *
 * Format: `did:ucol:<base58-encoded-pubkey>`
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @returns DID string
 */
export function deriveAgentDID(publicKey: Uint8Array): DID {
  const encoded = bs58.encode(publicKey);
  return `did:ucol:${encoded}`;
}

/**
 * Extract the public key bytes from a UCOL DID.
 *
 * @param did - DID string (did:ucol:[node:]<base58-pubkey>)
 * @returns 32-byte public key
 * @throws Error if DID format is invalid
 */
export function publicKeyFromDID(did: DID): Uint8Array {
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did' || parts[1] !== 'ucol') {
    throw new Error(`Invalid UCOL DID format: ${did}`);
  }
  // parts[2] is either "node" (with parts[3] = key) or the key itself
  const keyPart = parts[2] === 'node' ? parts[3] : parts[2];
  if (!keyPart) {
    throw new Error(`Missing key component in DID: ${did}`);
  }
  return bs58.decode(keyPart);
}

/**
 * Sign arbitrary bytes with an Ed25519 private key.
 *
 * @param data - Bytes to sign
 * @param privKey - 32-byte Ed25519 private key seed
 * @returns base64url-encoded signature string
 */
export async function sign(data: Uint8Array, privKey: Uint8Array): Promise<Signature> {
  const sigBytes = ed.sync.sign(data, privKey);
  return Buffer.from(sigBytes).toString('base64url');
}

/**
 * Verify an Ed25519 signature.
 *
 * @param sig - base64url-encoded 64-byte signature
 * @param data - Original signed data
 * @param pubKey - 32-byte Ed25519 public key
 * @returns true if signature is valid
 */
export async function verify(
  sig: Signature,
  data: Uint8Array,
  pubKey: Uint8Array
): Promise<boolean> {
  try {
    const sigBytes = Buffer.from(sig, 'base64url');
    return ed.sync.verify(sigBytes, data, pubKey);
  } catch {
    return false;
  }
}

/**
 * Sign a UCOL knowledge item payload: id + content + valid_from
 *
 * @param id - Item UUID
 * @param content - Item content string
 * @param validFrom - ISO 8601 timestamp
 * @param privKey - 32-byte private key
 * @returns base64url-encoded signature
 */
export async function signKnowledgeItem(
  id: string,
  content: string,
  validFrom: string,
  privKey: Uint8Array
): Promise<Signature> {
  const payload = `${id}${content}${validFrom}`;
  const data = new TextEncoder().encode(payload);
  return sign(data, privKey);
}

/**
 * Sign an artifact payload: id + checksum + produced_at
 *
 * @param id - Artifact UUID
 * @param checksum - SHA-256 hex of artifact content
 * @param producedAt - ISO 8601 timestamp
 * @param privKey - 32-byte private key
 * @returns base64url-encoded signature
 */
export async function signArtifact(
  id: string,
  checksum: string,
  producedAt: string,
  privKey: Uint8Array
): Promise<Signature> {
  const payload = `${id}${checksum}${producedAt}`;
  const data = new TextEncoder().encode(payload);
  return sign(data, privKey);
}

/**
 * Node identity bundle — persisted on node initialization
 */
export interface NodeIdentity {
  nodeId: DID;
  publicKey: Uint8Array;
  /** WARNING: Store securely; never export over network */
  privateKey: Uint8Array;
  version: string;
  createdAt: string;
}

/**
 * Initialize a new node identity.
 *
 * @param version - Protocol version string (e.g. "0.1.0")
 * @returns NodeIdentity bundle
 */
export async function initNodeIdentity(version: string = '0.1.0'): Promise<NodeIdentity> {
  const kp = await generateKeyPair();
  return {
    nodeId: deriveDID(kp.publicKey),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    version,
    createdAt: new Date().toISOString(),
  };
}
