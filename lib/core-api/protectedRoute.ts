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
  options: ProtectedRouteOptions = {}
): Promise<Response> {
  try {
    const user = await requireAuth();
    const ip = getClientIP(req);
    const requestId = buildRequestId(req);
    const idempotencyKey = buildIdempotencyKey(req, user.userId, options.idempotencyPrefix || 'request');

    return await handler({ user, ip, requestId, idempotencyKey });
  } catch (error) {
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
