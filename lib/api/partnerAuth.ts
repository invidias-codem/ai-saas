/**
 * Partner API authentication middleware for the /api/v1 gateway.
 *
 * Validates an incoming Bearer API key, resolves it to a workspace, checks
 * scopes, and applies per-key rate limiting. Returns a typed result that
 * route handlers use to scope all downstream work.
 *
 * Usage in a route handler:
 *   const auth = await authenticatePartner(req, 'query:read');
 *   if (!auth.ok) return auth.response;       // 401/403/429 already formed
 *   // ... use auth.context.workspaceId, auth.context.keyId
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { hashKey, isValidKeyFormat, hasScope, type PartnerScope } from '@/lib/api/partnerKeys';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export interface PartnerContext {
  keyId: string;
  workspaceId: string;
  userId: string;
  environment: 'test' | 'live';
  scopes: string[];
  rateLimitPerMin: number;
}

export type PartnerAuthResult =
  | { ok: true; context: PartnerContext }
  | { ok: false; response: NextResponse };

// Lazy Upstash limiter cache, keyed by per-minute limit so each key tier
// reuses one Ratelimit instance.
const isUpstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
const limiterCache = new Map<number, Ratelimit>();

function getLimiter(perMin: number): Ratelimit | null {
  if (!isUpstashConfigured) return null;
  if (!redis) redis = Redis.fromEnv();
  if (!limiterCache.has(perMin)) {
    limiterCache.set(
      perMin,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(perMin, '1 m'),
        analytics: true,
        prefix: 'partner_rl',
      })
    );
  }
  return limiterCache.get(perMin)!;
}

function errorResponse(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Extract the Bearer token from the Authorization header.
 * Accepts "Authorization: Bearer lat_live_..." or "x-api-key: lat_live_...".
 */
function extractKey(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const apiKeyHeader = req.headers.get('x-api-key');
  if (apiKeyHeader) return apiKeyHeader.trim();
  return null;
}

/**
 * Authenticate a partner request and (optionally) enforce a required scope.
 *
 * @param req       The incoming request.
 * @param required  Scope the endpoint requires (omit to only authenticate).
 */
export async function authenticatePartner(
  req: NextRequest,
  required?: PartnerScope
): Promise<PartnerAuthResult> {
  // 1. Extract key
  const plaintext = extractKey(req);
  if (!plaintext) {
    return {
      ok: false,
      response: errorResponse(401, 'missing_api_key', 'Provide an API key via Authorization: Bearer or x-api-key header.'),
    };
  }

  // 2. Fast structural validation (fail before DB)
  if (!isValidKeyFormat(plaintext)) {
    return {
      ok: false,
      response: errorResponse(401, 'invalid_api_key', 'Malformed API key.'),
    };
  }

  if (!supabaseAdmin) {
    return {
      ok: false,
      response: errorResponse(500, 'server_error', 'Auth backend not configured.'),
    };
  }

  // 3. Look up by hash
  const keyHash = hashKey(plaintext);
  const { data: key, error } = await supabaseAdmin
    .from('partner_keys')
    .select('id, workspace_id, user_id, environment, scopes, rate_limit_per_min, revoked, expires_at')
    .eq('key_hash', keyHash)
    .single();

  if (error || !key) {
    return {
      ok: false,
      response: errorResponse(401, 'invalid_api_key', 'API key not recognized.'),
    };
  }

  // 4. Revocation + expiry checks
  if (key.revoked) {
    return {
      ok: false,
      response: errorResponse(401, 'revoked_api_key', 'This API key has been revoked.'),
    };
  }
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return {
      ok: false,
      response: errorResponse(401, 'expired_api_key', 'This API key has expired.'),
    };
  }

  // 5. Scope check
  if (required && !hasScope(key.scopes ?? [], required)) {
    return {
      ok: false,
      response: errorResponse(403, 'insufficient_scope', `This key lacks the required scope: ${required}.`),
    };
  }

  // 6. Rate limit (per-key)
  const limiter = getLimiter(key.rate_limit_per_min ?? 100);
  if (limiter) {
    const rl = await limiter.limit(`key:${key.id}`);
    if (!rl.success) {
      const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
      const res = errorResponse(429, 'rate_limited', 'Rate limit exceeded.');
      res.headers.set('Retry-After', String(retryAfter));
      res.headers.set('X-RateLimit-Limit', String(rl.limit));
      res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
      return { ok: false, response: res };
    }
  }

  // 7. Fire-and-forget last_used_at update (don't block the request)
  void supabaseAdmin
    .from('partner_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id);

  return {
    ok: true,
    context: {
      keyId: key.id,
      workspaceId: key.workspace_id,
      userId: key.user_id,
      environment: key.environment,
      scopes: key.scopes ?? [],
      rateLimitPerMin: key.rate_limit_per_min ?? 100,
    },
  };
}
