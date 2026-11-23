// lib/pilots/clientOps/demoAuth.ts
// Shared authorization for the C1 protected demo UI.
//
// Security contract:
//   - Feature gate ENABLE_CLIENT_OPS_DEMO must be "true" (default: off → 404, no leakage)
//   - Production environments always fail-closed (404) regardless of the flag,
//     so the demo cannot be accidentally activated in production.
//   - User must be authenticated via Clerk
//   - User must be an OWNER of the requested workspace (role === 'owner');
//     workspace:read alone is insufficient — viewers and members also have it
//   - Real Clerk identity is used for authorization ONLY; the demo evaluation
//     always uses synthetic fixtures, never real customer data

import { auth } from '@clerk/nextjs/server';
import { getWorkspaceAccess } from '@/lib/security/workspaceAccess';

export const CLIENT_OPS_DEMO_FEATURE_FLAG = 'ENABLE_CLIENT_OPS_DEMO';

/**
 * Production is defined as Vercel production env only.
 * NODE_ENV=production is also set on Vercel preview builds, so we must not
 * gate on it — previews must be able to run the demo.
 */
export function isProduction(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export function isClientOpsDemoEnabled(): boolean {
  // Production fail-closed: never enable the demo in production, regardless
  // of the feature flag value. Defense-in-depth against accidental activation.
  if (isProduction()) return false;
  return process.env[CLIENT_OPS_DEMO_FEATURE_FLAG] === 'true';
}

export interface DemoAccessResult {
  userId: string;
  workspaceId: string;
  role: 'owner';
}

/**
 * Authorize access to the C1 demo UI.
 *
 * Throws an error with a .status property (404 / 401 / 403) that route
 * handlers convert to NextResponse. Never returns synthetic tenant/workspace
 * IDs — those come from fixtures, not from the request.
 */
export async function requireDemoAccess(
  workspaceId: string
): Promise<DemoAccessResult> {
  if (!isClientOpsDemoEnabled()) {
    const error = new Error('Demo not enabled');
    (error as Error & { status?: number }).status = 404;
    throw error;
  }

  const { userId } = await auth();
  if (!userId) {
    const error = new Error('Authentication required');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }

  const access = await getWorkspaceAccess(userId, workspaceId);
  if (!access || access.role !== 'owner') {
    const error = new Error('Owner-only access required');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }

  return { userId, workspaceId, role: 'owner' };
}

/**
 * Convert a DemoAccess authorization error to a NextResponse.
 */
export function demoAccessErrorResponse(error: unknown): Response {
  const status = (error as Error & { status?: number })?.status ?? 500;
  return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
