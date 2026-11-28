import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP, type AuthenticatedUser } from '@/lib/security/apiAuth';

export interface ProtectedRouteContext {
  user: AuthenticatedUser;
  ip: string;
  requestId: string;
  idempotencyKey: string;
  guestId?: string;
}

export interface ProtectedRouteOptions {
  idempotencyPrefix?: string;
  allowGuest?: boolean;
}

function buildRequestId(req: Request): string {
  return (
    req.headers.get('x-request-id') ||
    req.headers.get('x-vercel-id') ||
    `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function buildIdempotencyKey(req: Request, userId: string, prefix: string): string {
  return req.headers.get('idempotency-key') || `${prefix}-${userId}-${Date.now()}`;
}

export async function withProtectedRoute(
  req: Request,
  handler: (ctx: ProtectedRouteContext) => Promise<Response>,
  options: ProtectedRouteOptions = {},
): Promise<Response> {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const requestId = buildRequestId(req);
    const idempotencyKey = buildIdempotencyKey(req, user.userId, options.idempotencyPrefix || 'request');

    return await handler({ user, ip, requestId, idempotencyKey });
  } catch (error) {
    // ── Guest fallback ──────────────────────────────────────────
    // If allowGuest is set and the error is an auth failure, derive a
    // guest session from the x-guest-id header set by proxy.ts middleware.
    if (options.allowGuest && req.headers.get('x-guest-id')) {
      const ip = getClientIP(req);
      const requestId = buildRequestId(req);
      const guestId = req.headers.get('x-guest-id')!;
      const idempotencyKey = buildIdempotencyKey(req, guestId, options.idempotencyPrefix || 'guest-request');

      return await handler({
        user: {
          userId: `guest:${guestId}`,
          email: null,
          tier: 'free',
          isGuest: true,
        } as any,
        ip,
        requestId,
        idempotencyKey,
        guestId,
      });
    }
    // ────────────────────────────────────────────────────────────
    return handleAuthError(error);
  }
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      error: message,
      ...(extra || {}),
    },
    { status }
  );
}
