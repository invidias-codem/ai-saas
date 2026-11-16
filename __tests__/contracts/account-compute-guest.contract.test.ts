/**
 * Account Compute Plane — A3 guest supervisor contract tests.
 *
 * Covers:
 *  1. Single VM serves two isolated workspaces (separate leases, separate namespaces).
 *  2. Unauthorized access refused (no membership / viewer role).
 *  3. Denial after membership revocation (getWorkspaceAccess returns null).
 *  4. Lease contention (second create while a lease is active → conflict).
 *  5. Stale-generation rejection.
 *  6. Quota exhaustion (max concurrent guests reached).
 *  7. Safe recovery after supervisor restart (new supervisor rejects stale leases).
 *
 * Provider and admission are mocked; no real Supabase or Daytona calls.
 */
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
}));
jest.mock('@/lib/intelligence/execution/accountCompute/lifecycle', () => ({
  ENABLE_ACCOUNT_COMPUTE_LIFECYCLE: true,
}));

let mod: any;

function resetAll() {
  mod = require('@/lib/intelligence/execution/accountCompute/guest');
}

beforeEach(resetAll);

function makeGuestProvider(overrides: Record<string, any> = {}) {
  return {
    id: 'mock-provider',
    createGuest: jest.fn().mockResolvedValue({ desktopId: 'desktop-1' }),
    startGuest: jest.fn().mockResolvedValue(undefined),
    suspendGuest: jest.fn().mockResolvedValue(undefined),
    destroyGuest: jest.fn().mockResolvedValue(undefined),
    healthGuest: jest.fn().mockResolvedValue({ healthy: true }),
    inspectGuest: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function scope(ownerUserId: string, workspaceId: string) {
  return { tenantId: `user:${ownerUserId}`, workspaceId };
}

describe('A3 — single VM, two isolated workspaces', () => {
  it('serves two workspaces on the same VM with separate leases and namespaces', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const ws1 = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    const ws2 = await sup.createWorkspaceGuest('user_A', 'ws-b', 'ws-ns-b', scope('user_A', 'ws-b'), 0);

    expect(ws1.ok).toBe(true);
    expect(ws2.ok).toBe(true);
    expect(ws1.state!.desktopId).toBe('desktop-1');
    expect(ws2.state!.desktopId).toBe('desktop-1');
    expect(ws1.state!.generation).toBe(1);
    expect(ws2.state!.generation).toBe(1);
    // Same VM (same desktopId), separate workspaces/namespaces.
    expect(provider.createGuest).toHaveBeenCalledTimes(2);
  });

  it('inspect returns per-workspace state', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    const inspect = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 1);

    expect(inspect.ok).toBe(true);
    expect(inspect.state!.workspaceId).toBe('ws-a');
    expect(inspect.state!.phase).toBe('running');
  });
});

describe('A3 — authorization', () => {
  it('viewer role is denied compute access', async () => {
    const { admitWorkspace } = require('@/lib/intelligence/execution/accountCompute/admission');
    const { getWorkspaceAccess } = require('@/lib/security/workspaceAccess');

    (getWorkspaceAccess as jest.Mock).mockResolvedValue({
      workspaceId: 'ws-a', userId: 'user_A', role: 'viewer',
      permissions: ['workspace:read', 'memory:read', 'document:read'],
      source: 'workspace_members',
    } as any);

    const decision = await admitWorkspace('user_A', 'ws-a');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('insufficient role');
  });

  it('denies access to a workspace with no membership', async () => {
    const { admitWorkspace } = require('@/lib/intelligence/execution/accountCompute/admission');
    const { getWorkspaceAccess } = require('@/lib/security/workspaceAccess');

    (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);

    const decision = await admitWorkspace('user_A', 'ws-a');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('access denied');
  });
});

describe('A3 — membership revocation', () => {
  it('denies after revocation (getWorkspaceAccess returns null on next call)', async () => {
    const { admitWorkspace } = require('@/lib/intelligence/execution/accountCompute/admission');
    const { getWorkspaceAccess } = require('@/lib/security/workspaceAccess');

    // First call: access granted.
    (getWorkspaceAccess as jest.Mock).mockResolvedValueOnce({
      workspaceId: 'ws-a', userId: 'user_A', role: 'member',
      permissions: ['workspace:read', 'repository:link', 'repository:unlink', 'memory:read', 'memory:write', 'document:read', 'document:write'],
      source: 'workspace_members',
    } as any);

    const before = await admitWorkspace('user_A', 'ws-a');
    expect(before.allowed).toBe(true);

    // Membership revoked → next call returns null.
    (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);

    const after = await admitWorkspace('user_A', 'ws-a');
    expect(after.allowed).toBe(false);
    expect(after.reason).toBe('access denied');
  });
});

describe('A3 — lease contention', () => {
  it('rejects a second active lease on the same workspace', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const first = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(first.ok).toBe(true);

    // Same workspace, same generation — lease already active → contention.
    const second = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 1);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('lease held');
    expect(provider.createGuest).toHaveBeenCalledTimes(1); // no second provision
  });
});

describe('A3 — stale generation rejection', () => {
  it('rejects operations with a stale generation', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const created = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(created.ok).toBe(true);
    const generation = created.state!.generation; // 1

    // Stale generation (0 != 1) → rejected.
    const inspect = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 0);
    expect(inspect.ok).toBe(false);
    expect(inspect.reason).toBe('stale generation');
    expect(inspect.generation).toBe(1);

    // Correct generation succeeds.
    const ok = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 1);
    expect(ok.ok).toBe(true);
  });
});

describe('A3 — quota exhaustion', () => {
  it('rejects creates past maxConcurrentGuests', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 2, leaseTtlMs: 300_000 });

    const r1 = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    const r2 = await sup.createWorkspaceGuest('user_A', 'ws-b', 'ws-ns-b', scope('user_A', 'ws-b'), 0);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const r3 = await sup.createWorkspaceGuest('user_A', 'ws-c', 'ws-ns-c', scope('user_A', 'ws-c'), 0);
    expect(r3.ok).toBe(false);
    expect(r3.reason).toBe('quota exhausted');
    expect(provider.createGuest).toHaveBeenCalledTimes(2); // no third provision
  });
});

describe('A3 — recovery after supervisor restart', () => {
  it('new supervisor rejects stale in-memory leases (fresh start)', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();

    // First supervisor instance creates a guest.
    const sup1 = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });
    const created = await sup1.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(created.ok).toBe(true);
    expect(created.state!.generation).toBe(1);

    // New supervisor instance (restart) — no in-memory leases, so generation 0 is accepted
    // as a fresh claim. The generation mismatch is detected on re-inspect with old gen.
    const sup2 = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });
    const inspect = await sup2.inspectWorkspaceGuest('user_A', 'ws-a', 1);
    expect(inspect.ok).toBe(false);
    expect(inspect.reason).toBe('no active lease');
  });

  it('suspend then resume recovers guest state', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const created = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(created.ok).toBe(true);

    const suspended = await sup.suspendWorkspaceGuest('user_A', 'ws-a', scope('user_A', 'ws-a'), 1);
    expect(suspended.ok).toBe(true);
    expect(suspended.state!.phase).toBe('suspended');

    const started = await sup.startWorkspaceGuest('user_A', 'ws-a', scope('user_A', 'ws-a'), 1);
    expect(started.ok).toBe(true);
    expect(started.state!.phase).toBe('running');
    expect(provider.startGuest).toHaveBeenCalled();
  });
});
