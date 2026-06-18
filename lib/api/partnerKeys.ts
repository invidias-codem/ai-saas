/**
 * Partner API Key generation and hashing utilities.
 *
 * Keys follow the format: lat_{env}_{random}
 *   e.g. lat_live_a1b2c3d4e5f6...  (live)
 *        lat_test_a1b2c3d4e5f6...  (test)
 *
 * SECURITY: We only ever store the SHA-256 hash of the full key. The plaintext
 * key is shown to the user exactly once at creation time and never persisted.
 */

import { createHash, randomBytes } from 'crypto';

export type KeyEnvironment = 'test' | 'live';

export interface GeneratedKey {
  /** Full plaintext key — shown once, never stored. */
  plaintext: string;
  /** Visible prefix for UI display, e.g. "lat_live_a1b2". */
  prefix: string;
  /** SHA-256 hash of the full key — what we store. */
  hash: string;
  environment: KeyEnvironment;
}

/** Number of random bytes in the key body (32 bytes = 64 hex chars). */
const KEY_BYTES = 32;

/** Length of the visible prefix shown in the UI (after lat_{env}_). */
const PREFIX_VISIBLE_CHARS = 4;

/**
 * Generate a new partner API key.
 * Returns the plaintext (show once), prefix (store for display), and hash (store for auth).
 */
export function generatePartnerKey(environment: KeyEnvironment): GeneratedKey {
  const body = randomBytes(KEY_BYTES).toString('hex');
  const plaintext = `lat_${environment}_${body}`;
  const prefix = `lat_${environment}_${body.slice(0, PREFIX_VISIBLE_CHARS)}`;
  const hash = hashKey(plaintext);

  return { plaintext, prefix, hash, environment };
}

/**
 * Hash a plaintext key with SHA-256.
 * Deterministic — used both at creation (to store) and at auth (to compare).
 */
export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Parse the environment from a plaintext key.
 * Returns null if the key is malformed.
 */
export function parseKeyEnvironment(plaintext: string): KeyEnvironment | null {
  if (plaintext.startsWith('lat_live_')) return 'live';
  if (plaintext.startsWith('lat_test_')) return 'test';
  return null;
}

/**
 * Validate the structural format of a key (does NOT check the DB).
 * Use as a fast-fail before hitting the database.
 */
export function isValidKeyFormat(plaintext: string): boolean {
  return /^lat_(live|test)_[a-f0-9]{64}$/.test(plaintext);
}

/** Available scopes a partner key can hold. */
export const PARTNER_SCOPES = [
  'memory:write', // POST /api/v1/memory
  'memory:read', // GET  /api/v1/memory
  'query:read', // POST /api/v1/query
  'stream:read', // POST /api/v1/stream
  'webhooks:manage', // POST /api/v1/webhooks
] as const;

export type PartnerScope = (typeof PARTNER_SCOPES)[number];

/** Check whether a set of granted scopes includes a required scope. */
export function hasScope(grantedScopes: string[], required: PartnerScope): boolean {
  return grantedScopes.includes(required);
}
