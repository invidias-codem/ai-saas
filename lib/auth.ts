/**
 * lib/auth.ts
 *
 * Minimal auth utilities for the Weaver API routes.
 * Used for bearer token validation on dispatch/retry endpoints.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Timing-safe string comparison.
 * Returns true if the strings are equal, false otherwise.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return timingSafeEqual(bufA, bufB);
  } catch {
    // Fallback for environments where timingSafeEqual is unavailable
    return a === b;
  }
}
