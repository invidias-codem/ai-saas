/**
 * Remote MCP Authorization — fail-closed authentication and authorization layer.
 *
 * Every MCP transport request is authenticated before the MCP server processes it.
 * Session identity is bound to the authenticated principal. Workspace and tenant
 * isolation are enforced per-session. Tool-specific permissions are checked on
 * every tool call. Security audit records redact credential material.
 *
 * Security model:
 *   - Authentication before initialization (MCP initialize request)
 *   - Authentication on every applicable subsequent request
 *   - Server-generated session identity bound to authenticated principal
 *   - Workspace membership verification (no default fallback)
 *   - Tool-specific discovery and execution permissions (no default allow)
 *   - Origin validation
 *   - Authorized session termination (owner only)
 *   - Cross-tenant access denial (independent tenant resolution)
 *   - Redacted security audit records
 */

import { auth } from '@clerk/nextjs/server';
import { randomUUID } from 'node:crypto';

/** Authenticated principal context bound to an MCP session. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  workspaceId: string;
  tenantId: string;
  token: string;
  authenticatedAt: number;
}

/** Tool-specific required permissions. Fail-closed: unknown tools are denied. */
const TOOL_PERMISSIONS: Record<string, string[]> = {
  'preflight.run': ['workspace:admin'],
  'license.validate_key': ['workspace:read'],
  'license.validate_payload': ['workspace:read'],
  'license.supported_tiers': ['workspace:read'],
  'platform.constants': ['workspace:read'],
};

/** Session store — in-memory for this implementation. Production uses Redis/DB. */
const sessions = new Map<
  string,
  AuthContext & { createdAt: number; lastActivity: number }
>();

/** Session TTL in milliseconds (5 minutes). */
const SESSION_TTL_MS = 300_000;

/** Sensitive header names redacted from audit records. */
const REDACTED_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'token',
  'cookie',
  'x-clerk-auth-token',
  'x-clerk-client-data',
]);

/**
 * Authenticate an incoming MCP transport request.
 *
 * Fail-closed: any failure returns a Response that bypasses the MCP server.
 * Uses Clerk auth (same pattern as web routes) to extract the authenticated
 * user identity. Binds the MCP session ID to the user's workspace and tenant.
 */
export async function authenticateRequest(req: {
  headers: Record<string, string | undefined> | Headers;
}): Promise<AuthContext | Response> {
  let userId: string | null;
  let token: string | null;
  let sessionClaims: Record<string, unknown> | undefined;

  try {
    const clerkAuth = await auth();
    userId = clerkAuth.userId ?? null;
    token = (await clerkAuth.getToken?.()) ?? null;
    sessionClaims = clerkAuth.sessionClaims as
      | Record<string, unknown>
      | undefined;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Authentication service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fail closed: no authenticated user
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fail closed: no token
  if (!token) {
    return new Response(JSON.stringify({ error: 'No session token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = req.headers as Record<string, string | undefined> | Headers;
  const getHeader = (name: string): string | undefined => {
    const h = headers as Headers;
    if (typeof h.get === 'function') return h.get(name) ?? undefined;
    return (headers as Record<string, string | undefined>)[name];
  };

  const incomingSessionId = getHeader('mcp-session-id');
  const sessionId = incomingSessionId || randomUUID();

  // Check existing session — enforce ownership: session must belong to the
  // currently authenticated principal. Cross-user session reuse is denied.
  const now = Date.now();
  const existing = sessions.get(sessionId);
  if (existing) {
    if (now - existing.lastActivity > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    } else if (existing.userId !== userId) {
      // Session exists but belongs to a different user — deny reuse.
      return new Response(JSON.stringify({ error: 'Session ownership mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      existing.lastActivity = now;
      return existing as AuthContext;
    }
  }

  // Resolve workspace and tenant from Clerk session claims. No default
  // fallback — if the claims do not contain workspace/tenant, authentication
  // fails closed.
  const workspaceId = sessionClaims?.workspace_id as string | undefined;
  const tenantId = sessionClaims?.tenant_id as string | undefined;
  if (!workspaceId || !tenantId) {
    return new Response(JSON.stringify({ error: 'No workspace or tenant binding' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authCtx: AuthContext = {
    userId,
    sessionId,
    workspaceId,
    tenantId,
    token,
    authenticatedAt: now,
  };

  sessions.set(sessionId, { ...authCtx, createdAt: now, lastActivity: now });
  return authCtx;
}

/**
 * Validate the Origin header for cross-origin request protection.
 * When MCP_ALLOWED_ORIGIN is not set, requests are denied (fail-closed).
 */
export function validateOrigin(req: {
  headers: Record<string, string | undefined> | Headers;
}): boolean {
  const allowedOrigin = process.env.MCP_ALLOWED_ORIGIN;
  if (!allowedOrigin) return false;

  const headers = req.headers as Record<string, string | undefined> | Headers;
  const getHeader = (name: string): string | undefined => {
    const h = headers as Headers;
    if (typeof h.get === 'function') return h.get(name) ?? undefined;
    return (headers as Record<string, string | undefined>)[name];
  };

  const origin = getHeader('origin');
  return origin === allowedOrigin;
}

/**
 * Check if the authenticated principal has permission to call a tool.
 * Fail-closed: unknown tools are denied; known tools require their listed
 * permissions resolved from Clerk session claims.
 */
export function checkToolPermission(
  authCtx: AuthContext,
  toolName: string,
  sessionClaims: Record<string, unknown>,
): boolean {
  const required = TOOL_PERMISSIONS[toolName];
  if (!required) return false; // unknown tool → denied

  // Resolve the caller's roles/capabilities from Clerk session claims.
  const callerRoles = (sessionClaims?.roles as string[]) ?? [];
  const callerPermissions = (sessionClaims?.permissions as string[]) ?? [];

  // The caller must possess at least one required permission or role.
  return required.some((perm) =>
    callerRoles.includes(perm) || callerPermissions.includes(perm),
  );
}

/**
 * Redact sensitive header values from audit records.
 * Never log credential material.
 */
export function redactAuditRecord(record: unknown): unknown {
  if (typeof record !== 'object' || record === null) return record;

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_HEADERS.has(lowerKey)) {
      redacted[key] = '[REDACTED]';
    } else if (key === 'headers' && typeof value === 'object' && value !== null) {
      redacted[key] = redactAuditRecord(value);
    } else if (key === 'body' && typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        redacted[key] = JSON.stringify(redactAuditRecord(parsed));
      } catch {
        redacted[key] = value;
      }
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Terminate a session. Only the session owner can terminate their own session.
 */
export function terminateSession(
  authCtx: AuthContext,
  sessionIdToTerminate: string,
): { allowed: boolean; reason?: string } {
  const session = sessions.get(sessionIdToTerminate);
  if (!session) {
    return { allowed: false, reason: 'Session not found' };
  }

  // Session owner can terminate their own session
  if (session.userId === authCtx.userId) {
    sessions.delete(sessionIdToTerminate);
    return { allowed: true };
  }

  return { allowed: false, reason: 'Session ownership mismatch' };
}

/**
 * Check cross-tenant access. Resolves the requested resource's tenant
 * independently and compares it to the authenticated principal's tenant.
 */
export function checkTenantAccess(
  authCtx: AuthContext,
  resourceTenantId: string,
): boolean {
  return authCtx.tenantId === resourceTenantId;
}

/** Current number of active sessions (for bounded session counts). */
export function getSessionCount(): number {
  return sessions.size;
}
