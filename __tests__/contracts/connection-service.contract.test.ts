/**
 * Phase 2A (#444 + #445 review) — shared connection service contracts.
 *
 * Pure + mocked-supabase tests: inventory states (stored credential is
 * unverified, never connected), typed lookup failures distinct from
 * not_connected, provider-error classification from the INSTALLED SDK's
 * error shape (err.response.headers; primary + secondary rate limits), and
 * the status endpoint's honest derivation with typed failure propagation.
 */
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/encryption', () => ({ decrypt: jest.fn() }));
jest.mock('@/lib/github', () => ({ getOctokit: jest.fn() }));
jest.mock('next/server', () => ({
  NextResponse: class {
    static json(body: unknown, init?: ResponseInit) {
      return { body, status: (init as { status?: number } | undefined)?.status ?? 200 };
    }
  },
}));
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn().mockResolvedValue({ userId: 'u1' }) }));

import {
  classifyGitHubError,
  getConnections,
  resolveConnectionCredential,
  describeGitHubConnection,
} from '@/lib/integrations/connectionService';
import { decrypt } from '@/lib/encryption';
import { getOctokit } from '@/lib/github';

/** Thenable query builder matching the supabase chain shapes used here. */
function makeQuery(result: { data?: unknown; error?: unknown }) {
  const query = { data: result.data ?? null, error: result.error ?? null };
  const promise = Promise.resolve(query);
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(query)),
  };
  builder.then = promise.then.bind(promise);
  return builder;
}

const supabase = () => require('@/lib/supabaseClient').supabaseAdmin as { from: jest.Mock };

beforeEach(() => {
  supabase().from.mockReset();
  (decrypt as jest.Mock).mockReset();
  (getOctokit as jest.Mock).mockReset();
});

describe('provider-error classification reads the installed SDK shape (#445 finding 1)', () => {
  // @octokit/request-error@7.1.0 RequestError: headers live at
  // err.response.headers — there is no top-level err.headers.
  it('primary rate limit (403 + exhausted remaining, on response.headers) is provider_unavailable', () => {
    const classified = classifyGitHubError({
      status: 403,
      message: 'API rate limit exceeded',
      response: { headers: { 'x-ratelimit-remaining': '0' } },
    });
    expect(classified.status).toBe('provider_unavailable');
    expect(classified.evidence).toMatchObject({ status: 403, ratelimitRemaining: '0' });
  });

  it('SECONDARY rate limit (403 + Retry-After) is provider_unavailable, not access_denied', () => {
    const classified = classifyGitHubError({
      status: 403,
      message: 'You have triggered an abuse detection mechanism',
      response: { headers: { 'retry-after': '60' } },
    });
    expect(classified.status).toBe('provider_unavailable');
    expect(classified.evidence).toMatchObject({ retryAfter: '60' });
  });

  it('401 is expired_reconnect_required', () => {
    expect(
      classifyGitHubError({ status: 401, message: 'Bad credentials', response: { headers: {} } }).status,
    ).toBe('expired_reconnect_required');
  });

  it('403 without rate-limit evidence is access_denied', () => {
    expect(
      classifyGitHubError({ status: 403, response: { headers: { 'x-ratelimit-remaining': '4900' } } }).status,
    ).toBe('access_denied');
  });

  it('non-SDK error shapes with top-level headers still classify (fallback)', () => {
    expect(classifyGitHubError({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }).status).toBe(
      'provider_unavailable',
    );
  });

  it('5xx and network failures are provider_unavailable', () => {
    expect(classifyGitHubError({ status: 502 }).status).toBe('provider_unavailable');
    expect(classifyGitHubError({ message: 'getaddrinfo ENOTFOUND' }).status).toBe('provider_unavailable');
  });
});

describe('inventory: stored credential is unverified, never connected (#444)', () => {
  it('a row with a stored credential reports unverified + safe metadata only', async () => {
    supabase().from.mockReturnValue(
      makeQuery({
        data: [
          {
            service_name: 'github',
            access_token_encrypted: 'enc-token',
            metadata: { github_login: 'jj-em' },
            updated_at: '2026-10-01T00:00:00Z',
          },
        ],
      }),
    );
    const connections = await getConnections('u1');
    expect(connections).toEqual([
      { service: 'github', status: 'unverified', login: 'jj-em', updatedAt: '2026-10-01T00:00:00Z' },
    ]);
  });

  it('no rows → empty inventory (nothing fabricated)', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: [] }));
    expect(await getConnections('u1')).toEqual([]);
  });

  it('DB failure is a typed lookup failure, never not_connected', async () => {
    supabase().from.mockReturnValue(makeQuery({ error: { message: 'connection refused' } }));
    await expect(getConnections('u1')).rejects.toMatchObject({ code: 'DB_ERROR' });
  });
});

describe('credential resolution: distinct failures stay distinct (#444)', () => {
  it('no credential row → null (not_connected)', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: null }));
    expect(await resolveConnectionCredential('u1', 'github')).toBeNull();
  });

  it('decryption failure is DECRYPTION_FAILED, never not_connected', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: { access_token_encrypted: 'enc-token' } }));
    (decrypt as jest.Mock).mockImplementation(() => {
      throw new Error('bad key');
    });
    await expect(resolveConnectionCredential('u1', 'github')).rejects.toMatchObject({
      code: 'DECRYPTION_FAILED',
    });
  });

  it('resolves the caller\'s credential token', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: { access_token_encrypted: 'enc-token' } }));
    (decrypt as jest.Mock).mockReturnValue('plain-token');
    expect(await resolveConnectionCredential('u1', 'github')).toEqual({
      service: 'github',
      token: 'plain-token',
    });
  });
});

describe('describeGitHubConnection — the status endpoint\'s rules (#444)', () => {
  it('no credential → not_connected, connected false', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: null }));
    const status = await describeGitHubConnection('u1', { verify: true });
    expect(status.status).toBe('not_connected');
    expect(status.connected).toBe(false);
    expect(status.verification).toBeNull();
  });

  it('stored credential without verification → unverified, never connected', async () => {
    supabase().from.mockReturnValue(
      makeQuery({ data: { access_token_encrypted: 'enc', metadata: { github_login: 'jj-em' } } }),
    );
    (decrypt as jest.Mock).mockReturnValue('token');
    const status = await describeGitHubConnection('u1', { verify: false });
    expect(status.status).toBe('unverified');
    expect(status.connected).toBe(false);
  });

  it('a successful provider check → connected_verified with evidence', async () => {
    supabase().from.mockReturnValue(
      makeQuery({ data: { access_token_encrypted: 'enc', metadata: { github_login: 'old-login' } } }),
    );
    (decrypt as jest.Mock).mockReturnValue('token');
    (getOctokit as jest.Mock).mockReturnValue({
      rest: {
        users: {
          getAuthenticated: jest.fn().mockResolvedValue({
            data: { login: 'jj-em' },
            headers: { 'x-github-request-id': 'req-1' },
          }),
        },
      },
    });
    const status = await describeGitHubConnection('u1', { verify: true });
    expect(status.status).toBe('connected_verified');
    expect(status.connected).toBe(true);
    expect(status.username).toBe('jj-em');
    expect(status.verification).toMatchObject({ method: 'github:users.getAuthenticated', requestId: 'req-1' });
    expect(Date.parse(status.verification!.verifiedAt)).not.toBeNaN();
  });

  it('a revoked credential (provider 401) → reconnect required, connected false', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: { access_token_encrypted: 'enc', metadata: {} } }));
    (decrypt as jest.Mock).mockReturnValue('token');
    (getOctokit as jest.Mock).mockReturnValue({
      rest: {
        users: {
          getAuthenticated: jest
            .fn()
            .mockRejectedValue({ status: 401, message: 'Bad credentials', response: { headers: {} } }),
        },
      },
    });
    const status = await describeGitHubConnection('u1', { verify: true });
    expect(status.status).toBe('expired_reconnect_required');
    expect(status.connected).toBe(false);
  });

  it('a local decryption failure PROPAGATES typed — never reported as provider revocation (#445 finding 4)', async () => {
    supabase().from.mockReturnValue(
      makeQuery({ data: { access_token_encrypted: 'enc', metadata: {} } }),
    );
    (decrypt as jest.Mock).mockImplementation(() => {
      throw new Error('bad key');
    });
    await expect(describeGitHubConnection('u1', { verify: true })).rejects.toMatchObject({
      code: 'DECRYPTION_FAILED',
    });
  });
});

describe('status endpoint uses the shared rules, UI shape preserved (#444)', () => {
  it('GET reports the honest status and never fabricates connected', async () => {
    // No credential row for this user: not_connected, connected: false —
    // and no provider request is made.
    supabase().from.mockReturnValue(makeQuery({ data: null }));
    const { GET } = await import('@/app/api/integrations/github/status/route');
    const status = await GET();
    expect((status as unknown as { body: Record<string, unknown> }).body).toMatchObject({
      connected: false,
      status: 'not_connected',
    });
    expect(getOctokit).not.toHaveBeenCalled();
  });

  it('GET surfaces a typed decryption failure as a server error, not a connection state (#445 finding 4)', async () => {
    supabase().from.mockReturnValue(makeQuery({ data: { access_token_encrypted: 'enc', metadata: {} } }));
    (decrypt as jest.Mock).mockImplementation(() => {
      throw new Error('bad key');
    });
    const { GET } = await import('@/app/api/integrations/github/status/route');
    const status = await GET();
    expect((status as unknown as { status: number }).status).toBe(500);
  });
});
