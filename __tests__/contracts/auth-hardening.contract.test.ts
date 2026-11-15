/**
 * Backend authorization hardening tests (#510).
 *
 * Covers the four hardening goals:
 *  1. requireAuth() bypass is test-only — MOCK_USER_ID cannot bypass Clerk in production.
 *  2. attachOperatingProfiles() scopes profiles to the authenticated user — blocks cross-user IDOR.
 *  3. Workspace mutation rejects client-supplied resource IDs the user doesn't own (403/400).
 *  4. Role revocation: a deleted membership denies on the next check (no cached state).
 *
 * All seams are mocked; no real Supabase, Clerk, or network calls are made.
 */
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));
jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: { from: jest.fn() },
  supabase: null,
}));
jest.mock('next/server', () => ({
  NextResponse: class {
    static json(body: unknown, init?: ResponseInit) {
      return { body, status: (init as { status?: number } | undefined)?.status ?? 200 };
    }
  },
}));
jest.mock('@/lib/security/rateLimit', () => ({
  limitApiEndpoint: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/lib/workspaces/operatingProfiles', () => ({
  ensureDefaultOperatingProfile: jest.fn(),
}));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn() }));

interface QueryBuilder {
  select: jest.Mock;
  eq: jest.Mock;
  in: jest.Mock;
  maybeSingle: jest.Mock;
  order: jest.Mock;
}

const builders: QueryBuilder[] = [];

function makeQuery(result: { data?: unknown; error?: unknown }): QueryBuilder {
  const query = { data: result.data ?? null, error: result.error ?? null };
  const promise = Promise.resolve(query);
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(query)),
    maybeSingle: jest.fn(() => Promise.resolve(query)),
    insert: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
  };
  builder.then = promise.then.bind(promise);
  builders.push(builder);
  return builder;
}

const queues: Record<string, QueryBuilder[]> = {};

function setTableQueue(table: string, results: Array<{ data?: unknown; error?: unknown }>) {
  queues[table] = results.map(makeQuery);
}

beforeEach(() => {
  builders.length = 0;
  for (const key of Object.keys(queues)) delete queues[key];
  const supabase = require('@/lib/supabaseClient').supabaseAdmin as { from: jest.Mock };
  supabase.from.mockReset();
  supabase.from.mockImplementation((t: string) => {
    const next = queues[t]?.shift();
    if (!next) throw new Error(`unexpected query on table '${t}'`);
    return next;
  });
  jest.clearAllMocks();
});

describe('P0 — requireAuth() bypass is test-only', () => {
  it('does NOT bypass Clerk when NODE_ENV is development and MOCK_USER_ID is unset', async () => {
    const origEnv = process.env.NODE_ENV;
    Reflect.set(process.env, 'NODE_ENV', 'development');
    delete process.env.MOCK_USER_ID;
    try {
      const { requireAuth } = await import('@/lib/security/apiAuth');
      ((await import('@clerk/nextjs/server')).auth as unknown as jest.Mock).mockResolvedValue({ userId: 'clerk-user' });
      const user = await requireAuth();
      expect(user.userId).toBe('clerk-user');
    } finally {
      Reflect.set(process.env, 'NODE_ENV', origEnv);
    }
  });

  it('does NOT bypass Clerk when MOCK_USER_ID is set in production', async () => {
    const origEnv = process.env.NODE_ENV;
    Reflect.set(process.env, 'NODE_ENV', 'production');
    process.env.MOCK_USER_ID = 'mock-user';
    try {
      const { requireAuth } = await import('@/lib/security/apiAuth');
      ((await import('@clerk/nextjs/server')).auth as unknown as jest.Mock).mockResolvedValue({ userId: null });
      await expect(requireAuth()).rejects.toMatchObject({ name: 'AuthenticationError' });
    } finally {
      Reflect.set(process.env, 'NODE_ENV', origEnv);
      delete process.env.MOCK_USER_ID;
    }
  });

  it('bypasses Clerk only in test with MOCK_USER_ID', async () => {
    const origEnv = process.env.NODE_ENV;
    Reflect.set(process.env, 'NODE_ENV', 'test');
    process.env.MOCK_USER_ID = 'mock-user';
    try {
      const { requireAuth } = await import('@/lib/security/apiAuth');
      const user = await requireAuth();
      expect(user.userId).toBe('mock-user');
    } finally {
      Reflect.set(process.env, 'NODE_ENV', origEnv);
      delete process.env.MOCK_USER_ID;
    }
  });
});

describe('P1 — attachOperatingProfiles() blocks cross-user IDOR', () => {
  it('only returns profiles owned by the authenticated user', async () => {
    const { attachOperatingProfiles } = await import('@/lib/workspaces/query');

    setTableQueue('operating_profiles', [
      { data: [{ id: '00000000-0000-0000-0000-000000000001', user_id: 'user-a', name: 'Profile A' }] },
      { data: null },
    ]);

    const workspaces = [
      { id: 'ws-1', default_operating_profile_id: '00000000-0000-0000-0000-000000000001' },
      { id: 'ws-2', default_operating_profile_id: '00000000-0000-0000-0000-000000000002' },
    ];

    const result = await attachOperatingProfiles('user-a', workspaces);

    expect(result[0].default_operating_profile).toMatchObject({
      id: '00000000-0000-0000-0000-000000000001',
      user_id: 'user-a',
    });
    expect(result[1].default_operating_profile).toBeNull();

    const supabase = require('@/lib/supabaseClient').supabaseAdmin as { from: jest.Mock };
    const opIndex = supabase.from.mock.calls.findIndex((c: any[]) => c[0] === 'operating_profiles');
    const opBuilder = supabase.from.mock.results[opIndex].value;
    expect(opBuilder.in).toHaveBeenCalledWith('id', [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ]);
    expect(opBuilder.eq).toHaveBeenCalledWith('user_id', 'user-a');
  });
});

describe('P1 — workspace mutation rejects client-supplied resource IDs', () => {
  it('POST /api/workspaces rejects an operating profile owned by another user (400)', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    setTableQueue('operating_profiles', [{ data: null }]);
    setTableQueue('workspaces', [{ data: null }]);
    setTableQueue('workspace_state', [{ data: null }, { data: null }]);
    setTableQueue('workspace_members', [{ data: null }, { data: null }]);

    ((await import('@clerk/nextjs/server')).auth as unknown as jest.Mock).mockResolvedValue({ userId: 'caller-user' });

    const req = new Request('https://lattice.test/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Evil Workspace',
        defaultOperatingProfileId: '00000000-0000-0000-0000-000000000002', // another user's profile
      }),
    });

    const res = await POST(req);
    expect((res as { status: number }).status).toBe(400);
  });

  it('POST /api/workspaces accepts an operating profile owned by the caller', async () => {
    const { POST } = await import('@/app/api/workspaces/route');
    const opProfile = await import('@/lib/workspaces/operatingProfiles');

    (opProfile.ensureDefaultOperatingProfile as jest.Mock).mockResolvedValue({
      id: 'default-profile',
      user_id: 'caller-user',
    });

    setTableQueue('operating_profiles', [
      { data: { id: '00000000-0000-0000-0000-000000000001', user_id: 'caller-user' } },
    ]);
    setTableQueue('workspaces', [
      { data: null }, // ensureDefaultWorkspace: no existing default workspace
      { data: { id: 'default-ws', user_id: 'caller-user', name: 'My Workspace' } }, // ensureDefaultWorkspace insert
      { data: null }, // slug uniqueness loop: no existing slug
      { data: { id: 'new-ws', user_id: 'caller-user', name: 'My Workspace' } }, // POST insert
    ]);
    setTableQueue('workspace_state', [{ data: null }, { data: null }]);
    setTableQueue('workspace_members', [{ data: null }, { data: null }]);

    ((await import('@clerk/nextjs/server')).auth as unknown as jest.Mock).mockResolvedValue({ userId: 'caller-user' });

    const req = new Request('https://lattice.test/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({
        name: 'My Workspace',
        defaultOperatingProfileId: '00000000-0000-0000-0000-000000000001',
      }),
    });

    const res = await POST(req);
    expect((res as { status: number }).status).toBe(200);
  });
});

describe('P1 — role revocation denies on next check (no cached state)', () => {
  it('denies access after membership row is deleted', async () => {
    const { getWorkspaceAccess } = await import('@/lib/security/workspaceAccess');

    setTableQueue('workspace_members', [
      { data: { role: 'member', accepted_at: '2026-01-01' } },
    ]);
    const before = await getWorkspaceAccess('u1', 'ws1');
    expect(before?.role).toBe('member');

    setTableQueue('workspace_members', [{ data: null }]);
    setTableQueue('workspaces', [{ data: null }]);
    const after = await getWorkspaceAccess('u1', 'ws1');
    expect(after).toBeNull();
  });
});

describe('401 — unauthenticated requests are denied', () => {
  it('GET /api/workspaces returns 401 when no user session', async () => {
    const { GET } = await import('@/app/api/workspaces/route');
    ((await import('@clerk/nextjs/server')).auth as unknown as jest.Mock).mockResolvedValue({ userId: null });

    const res = await GET(new Request('https://lattice.test/api/workspaces'));
    expect((res as { status: number }).status).toBe(401);
  });
});
