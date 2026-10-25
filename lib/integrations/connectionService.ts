// lib/integrations/connectionService.ts
// Phase 2A (#444): the shared connection service.
//
// One vocabulary + one resolution path for Weaver tools AND the GitHub
// status endpoint. Reuses user_integrations + the existing encryption.
// Distinct failures stay distinct: DB errors and decryption failures are
// typed ConnectionLookupErrors, never collapsed into "not connected".
// Inventory makes NO provider calls — a stored credential without current
// verification reads as `unverified` until a provider operation succeeds.

import { supabaseAdmin } from '@/lib/supabaseClient';
import { decrypt } from '@/lib/encryption';

/** The service_name CHECK vocabulary from the user_integrations migration. */
export const CONNECTION_SERVICES = ['github', 'trello', 'slack'] as const;
export type ConnectionServiceName = (typeof CONNECTION_SERVICES)[number];

/** Typed lookup failures — distinct from the `not_connected` state. */
export class ConnectionLookupError extends Error {
  constructor(
    message: string,
    readonly code: 'DB_ERROR' | 'DECRYPTION_FAILED',
  ) {
    super(message);
    this.name = 'ConnectionLookupError';
  }
}

export interface UserConnectionSummary {
  service: string;
  status: 'not_connected' | 'unverified';
  login: string | null;
  updatedAt: string | null;
}

/** Provider-operation outcomes, in the #440 connection vocabulary. */
export type ProviderConnectionStatus =
  | 'connected_verified'
  | 'expired_reconnect_required'
  | 'access_denied'
  | 'provider_unavailable';

/**
 * Inventory the caller's connections. No provider calls, no credential
 * material in results. A stored credential is `unverified` — current access
 * is only established by a successful provider operation (#444).
 */
export async function getConnections(userId: string): Promise<UserConnectionSummary[]> {
  if (!supabaseAdmin) throw new ConnectionLookupError('Database configuration missing', 'DB_ERROR');

  const { data, error } = await supabaseAdmin
    .from('user_integrations')
    .select('service_name, access_token_encrypted, metadata, updated_at')
    .eq('user_id', userId);

  if (error) {
    throw new ConnectionLookupError(`Connection inventory query failed: ${error.message}`, 'DB_ERROR');
  }

  return (data ?? []).map((row) => ({
    service: row.service_name,
    status: row.access_token_encrypted ? ('unverified' as const) : ('not_connected' as const),
    login: row.metadata?.github_login ?? null,
    updatedAt: row.updated_at ?? null,
  }));
}

/**
 * Resolve the CALLER's persisted credential for a service. Identity is the
 * boundary: this resolves from the authenticated runtime identity only — a
 * shared workspace membership never reaches another user's credentials.
 * Returns null (not_connected) when the caller has no credential row;
 * DB and decryption failures throw typed errors.
 */
export async function resolveConnectionCredential(
  userId: string,
  service: ConnectionServiceName,
): Promise<{ service: string; token: string } | null> {
  if (!supabaseAdmin) throw new ConnectionLookupError('Database configuration missing', 'DB_ERROR');

  const { data, error } = await supabaseAdmin
    .from('user_integrations')
    .select('access_token_encrypted')
    .eq('user_id', userId)
    .eq('service_name', service)
    .maybeSingle();

  if (error) {
    throw new ConnectionLookupError(`Credential lookup failed: ${error.message}`, 'DB_ERROR');
  }
  if (!data?.access_token_encrypted) return null;

  let token: string;
  try {
    token = decrypt(data.access_token_encrypted);
  } catch {
    throw new ConnectionLookupError(
      'The stored GitHub credential could not be decrypted — reconnect required.',
      'DECRYPTION_FAILED',
    );
  }
  if (!token) return null;
  return { service, token };
}

/**
 * Classify a GitHub provider error by inspecting provider evidence (#444):
 * GitHub returns 403 for rate limiting, so status codes alone cannot
 * distinguish authorization failures from availability failures.
 */
export function classifyGitHubError(err: unknown): {
  status: ProviderConnectionStatus;
  message: string;
  evidence: Record<string, unknown>;
} {
  const e = err as { status?: number; message?: string; headers?: Record<string, unknown> } | null;
  const headers = (e?.headers ?? {}) as Record<string, unknown>;
  const rateRemaining = headers['x-ratelimit-remaining'] ?? headers['X-RateLimit-Remaining'];
  const status = e?.status;

  if (status === 403 && (rateRemaining === '0' || rateRemaining === 0)) {
    return {
      status: 'provider_unavailable',
      message: 'GitHub rate limit exhausted — this is not an authorization failure. Try again later.',
      evidence: { status, ratelimitRemaining: 0 },
    };
  }
  if (status === 401) {
    return {
      status: 'expired_reconnect_required',
      message: 'The GitHub credential is no longer valid. Reconnect your GitHub account.',
      evidence: { status },
    };
  }
  if (status === 403) {
    return {
      status: 'access_denied',
      message: 'GitHub denied this request.',
      evidence: { status },
    };
  }
  return {
    status: 'provider_unavailable',
    message: e?.message || 'GitHub is currently unavailable or the request failed.',
    evidence: { status: status ?? null },
  };
}

export interface GitHubConnectionStatus {
  status: 'not_connected' | 'unverified' | ProviderConnectionStatus;
  /** UI-compatibility shape: honest derivation — true only after a verified provider operation. */
  connected: boolean;
  username: string | null;
  email: string | null;
  verification: { verifiedAt: string; method: string; requestId: string | null } | null;
}

/**
 * The GitHub status endpoint's connection state, on the same rules the Weaver
 * tools use (#444: manifest and status alignment). With `verify: true` the
 * endpoint performs one provider check; without it, a stored credential
 * reports `unverified` — never `connected`.
 */
export async function describeGitHubConnection(
  userId: string,
  opts: { verify: boolean },
): Promise<GitHubConnectionStatus> {
  if (!supabaseAdmin) throw new ConnectionLookupError('Database configuration missing', 'DB_ERROR');

  const { data, error } = await supabaseAdmin
    .from('user_integrations')
    .select('access_token_encrypted, metadata')
    .eq('user_id', userId)
    .eq('service_name', 'github')
    .maybeSingle();

  if (error) {
    throw new ConnectionLookupError(`GitHub connection lookup failed: ${error.message}`, 'DB_ERROR');
  }

  const metadata = data?.metadata ?? {};
  const base = {
    username: metadata.github_login ?? null,
    email: metadata.github_email ?? null,
  };

  if (!data?.access_token_encrypted) {
    return { status: 'not_connected', connected: false, ...base, verification: null };
  }

  let token: string;
  try {
    token = decrypt(data.access_token_encrypted);
  } catch {
    return {
      status: 'expired_reconnect_required',
      connected: false,
      ...base,
      verification: null,
    };
  }
  if (!token) {
    return { status: 'not_connected', connected: false, ...base, verification: null };
  }
  if (!opts.verify) {
    return { status: 'unverified', connected: false, ...base, verification: null };
  }

  try {
    const { getOctokit } = await import('@/lib/github');
    const octokit = getOctokit(token);
    const response = await octokit.rest.users.getAuthenticated();
    return {
      status: 'connected_verified',
      connected: true,
      username: (response.data as { login?: string }).login ?? base.username,
      email: base.email,
      verification: {
        verifiedAt: new Date().toISOString(),
        method: 'github:users.getAuthenticated',
        requestId: (response.headers as Record<string, unknown>)['x-github-request-id'] as string | null ?? null,
      },
    };
  } catch (err) {
    const classified = classifyGitHubError(err);
    return { status: classified.status, connected: false, ...base, verification: null };
  }
}
