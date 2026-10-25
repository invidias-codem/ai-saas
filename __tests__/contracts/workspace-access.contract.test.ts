/**
 * Phase 1 (#442) — shared-workspace authorization + read-only discovery.
 *
 * Seam tests against mocked supabase:
 *  - accepted memberships grant access; PENDING invitations grant nothing;
 *    revoked (deleted) memberships deny subsequent reads (no cached state).
 *  - listAccessibleWorkspaces dedupes owned + accepted-shared, excludes pending.
 *  - GET /api/workspaces performs NO writes (read-only discovery).
 */
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));
jest.mock('next/server', () => ({
  NextResponse: class {
    static json(body: unknown, init?: ResponseInit) {
      return { body, status: (init as { status?: number } | undefined)?.status ?? 200 };
    }
  },
}));
jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ userId: 'u1' }),
  handleAuthError: jest.fn(),
  getClientIP: () => '127.0.0.1',
}));
jest.mock('@/lib/security/rateLimit', () => ({ limitApiEndpoint: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('@/lib/workspaces/operatingProfiles', () => ({ ensureDefaultOperatingProfile: jest.fn() }));
jest.mock('@/lib/workspaces/query', () => ({ attachOperatingProfiles: jest.fn(async (ws: unknown) => ws) }));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn() }));

import {
  getWorkspaceAccess,
  listAccessibleWorkspaces,
} from '@/lib/security/workspaceAccess';

interface Builder {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  in: jest.Mock;
  maybeSingle: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
}

const allBuilders: Builder[] = [];

/** Thenable query builder: `await chain` or `.maybeSingle()` both resolve {data, error}. */
function makeQuery(result: { data?: unknown; error?: unknown }) {
  const query = { data: result.data ?? null, error: result.error ?? null };
  const promise = Promise.resolve(query);
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    in: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(query)),
    insert: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
  };
  builder.then = promise.then.bind(promise);
  allBuilders.push(builder as Builder);
  return builder;
}

const queues: Record<string, Builder[]> = {};

function setTableQueue(table: string, results: Array<{ data?: unknown; error?: unknown }>) {
  queues[table] = results.map(makeQuery);
}

beforeEach(() => {
  allBuilders.length = 0;
  for (const key of Object.keys(queues)) delete queues[key];
  const supabase = require('@/lib/supabaseClient').supabaseAdmin as { from: jest.Mock };
  supabase.from.mockReset();
  supabase.from.mockImplementation((t: string) => {
    const next = queues[t]?.shift();
    if (!next) throw new Error(`unexpected query on table '${t}'`);
    return next;
  });
});

describe('getWorkspaceAccess — the single reusable access check (#442)', () => {
  it('an ACCEPTED membership grants access with its role', async () => {
    setTableQueue('workspace_members', [{ data: { role: 'member', accepted_at: '2026-10-01T00:00:00Z' } }]);
    const access = await getWorkspaceAccess('u1', 'ws1');
    expect(access).not.toBeNull();
    expect(access?.source).toBe('workspace_members');
    expect(access?.role).toBe('member');
  });

  it('a PENDING invitation (accepted_at null) grants nothing', async () => {
    setTableQueue('workspace_members', [{ data: { role: 'admin', accepted_at: null } }]);
    setTableQueue('workspaces', [{ data: null }]);
    const access = await getWorkspaceAccess('u1', 'ws1');
    expect(access).toBeNull();
  });

  it('a revoked membership (row deleted) blocks subsequent reads — no cached state', async () => {
    setTableQueue('workspace_members', [{ data: null }]);
    setTableQueue('workspaces', [{ data: null }]);
    expect(await getWorkspaceAccess('u1', 'ws1')).toBeNull();
    // Second call re-checks (fresh query, not a cached grant):
    setTableQueue('workspace_members', [{ data: null }]);
    setTableQueue('workspaces', [{ data: null }]);
    expect(await getWorkspaceAccess('u1', 'ws1')).toBeNull();
  });

  it('ownership fallback grants owner access', async () => {
    setTableQueue('workspace_members', [{ data: null }]);
    setTableQueue('workspaces', [{ data: { id: 'ws1' } }]);
    const access = await getWorkspaceAccess('u1', 'ws1');
    expect(access?.role).toBe('owner');
    expect(access?.source).toBe('workspace_owner');
  });

  it('an inaccessible workspace returns null — no partial information', async () => {
    setTableQueue('workspace_members', [{ data: null }]);
    setTableQueue('workspaces', [{ data: null }]);
    expect(await getWorkspaceAccess('u1', 'ws-other')).toBeNull();
  });
});

describe('listAccessibleWorkspaces — read-only discovery (#442)', () => {
  it('lists owned + accepted shared, deduplicated; pending invitations excluded', async () => {
    setTableQueue('workspaces', [
      { data: [{ id: 'w1', name: 'Owned Default', kind: 'personal', is_default: true }] },
      { data: [{ id: 'w2', name: 'Client Alpha', kind: 'project', is_default: false }] },
    ]);
    setTableQueue('workspace_members', [
      {
        data: [
          { workspace_id: 'w1', role: 'owner', accepted_at: '2026-10-01T00:00:00Z' }, // owned — deduped
          { workspace_id: 'w2', role: 'viewer', accepted_at: '2026-10-02T00:00:00Z' }, // accepted shared
          { workspace_id: 'w3', role: 'admin', accepted_at: null }, // pending — excluded
        ],
      },
    ]);

    const workspaces = await listAccessibleWorkspaces('u1');
    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]).toMatchObject({ id: 'w1', via: 'owner', role: 'owner' });
    expect(workspaces[1]).toMatchObject({ id: 'w2', via: 'member', role: 'viewer', name: 'Client Alpha' });
    expect(workspaces.map((w) => w.id)).not.toContain('w3');
  });

  it('never writes: only selects across workspaces and workspace_members', async () => {
    setTableQueue('workspaces', [{ data: [] }]);
    setTableQueue('workspace_members', [{ data: [] }]);
    await listAccessibleWorkspaces('u1');
    for (const builder of allBuilders) {
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.upsert).not.toHaveBeenCalled();
    }
  });
});

describe('GET /api/workspaces is read-only (#442)', () => {
  it('lists workspaces without creating a default workspace', async () => {
    const { GET } = await import('@/app/api/workspaces/route');
    setTableQueue('workspaces', [{ data: [{ id: 'w1', name: 'W' }], error: null }]);
    const res = await GET(new Request('https://lattice.test/api/workspaces'));
    expect((res as { status: number }).status).toBe(200);
    const supabase = require('@/lib/supabaseClient').supabaseAdmin as { from: jest.Mock };
    expect(supabase.from).toHaveBeenCalledWith('workspaces');
    for (const builder of allBuilders) {
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.upsert).not.toHaveBeenCalled();
    }
    expect(require('@/lib/workspaces/operatingProfiles').ensureDefaultOperatingProfile).not.toHaveBeenCalled();
  });
});
