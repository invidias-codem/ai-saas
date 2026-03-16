/**
 * @file api/auth.ts
 * @description Ed25519 bearer token authentication for the UCOL API.
 *
 * Token format: base64url(JSON({ agent_id, nonce, timestamp })) + "." + base64url(signature)
 * Signature covers: nonce + timestamp (UTF-8 encoded)
 *
 * Token validity: 5 minutes (configurable).
 */

import { verify } from '../identity/index.js';
import { publicKeyFromDID } from '../identity/index.js';

/** Parsed, validated auth token payload */
export interface AuthToken {
  agent_id: string;
  nonce: string;
  timestamp: number;
}

/** Token validity window in milliseconds (default: 5 minutes) */
const TOKEN_VALIDITY_MS = 5 * 60 * 1000;

/**
 * Parse and verify a UCOL bearer token.
 *
 * Token format: `<base64url-payload>.<base64url-signature>`
 * Payload: JSON({ agent_id, nonce, timestamp })
 * Signature: Ed25519 over UTF-8(nonce + timestamp)
 *
 * @param authHeader - HTTP Authorization header value ("Bearer <token>")
 * @param validityMs - Token validity window (default: 5 min)
 * @returns Parsed AuthToken if valid
 * @throws Error if token is invalid, expired, or signature fails
 */
export async function verifyBearerToken(
  authHeader: string | undefined | null,
  validityMs: number = TOKEN_VALIDITY_MS
): Promise<AuthToken> {
  if (!authHeader) {
    throw new Error('AUTH_MISSING: No Authorization header provided');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new Error('AUTH_INVALID: Authorization header must be "Bearer <token>"');
  }

  const token = parts[1];
  return verifyToken(token, validityMs);
}

/**
 * Verify a raw UCOL bearer token string.
 *
 * @param token - Raw token string (payload.signature)
 * @param validityMs - Token validity window in milliseconds
 * @returns Parsed AuthToken if valid
 */
export async function verifyToken(
  token: string,
  validityMs: number = TOKEN_VALIDITY_MS
): Promise<AuthToken> {
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx === -1) {
    throw new Error('AUTH_INVALID: Token must be <payload>.<signature>');
  }

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);

  // Decode and parse payload
  let payload: unknown;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error('AUTH_INVALID: Could not decode token payload');
  }

  if (!isAuthPayload(payload)) {
    throw new Error('AUTH_INVALID: Token payload missing required fields');
  }

  // Check timestamp
  const now = Date.now();
  const tokenAge = now - payload.timestamp;
  if (tokenAge > validityMs || tokenAge < -30_000) {
    // Allow 30s clock skew
    throw new Error('AUTH_EXPIRED: Token timestamp is outside validity window');
  }

  // Reconstruct signed data: nonce + timestamp (as string)
  const signedData = new TextEncoder().encode(`${payload.nonce}${payload.timestamp}`);

  // Derive public key from agent DID
  let pubKey: Uint8Array;
  try {
    pubKey = publicKeyFromDID(payload.agent_id);
  } catch {
    throw new Error(`AUTH_INVALID: Cannot derive public key from DID '${payload.agent_id}'`);
  }

  // Verify signature
  const valid = await verify(sigB64, signedData, pubKey);
  if (!valid) {
    throw new Error('AUTH_INVALID: Signature verification failed');
  }

  return payload;
}

/** Type guard for auth payload */
function isAuthPayload(obj: unknown): obj is AuthToken {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o['agent_id'] === 'string' &&
    typeof o['nonce'] === 'string' &&
    typeof o['timestamp'] === 'number'
  );
}

/**
 * Create a bearer token for testing / client-side use.
 *
 * @param agentId - Agent DID
 * @param privateKey - 32-byte Ed25519 private key
 * @returns Bearer token string
 */
export async function createBearerToken(
  agentId: string,
  privateKey: Uint8Array
): Promise<string> {
  const { sign } = await import('../identity/index.js');

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
  const timestamp = Date.now();

  const payload: AuthToken = { agent_id: agentId, nonce, timestamp };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signedData = new TextEncoder().encode(`${nonce}${timestamp}`);
  const sig = await sign(signedData, privateKey);

  return `${payloadB64}.${sig}`;
}
