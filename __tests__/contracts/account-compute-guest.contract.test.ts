/**
 * Account Compute Plane — A3 guest supervisor contract tests.
 *
 * Covers:
 *  1. Single VM serves two isolated workspaces (separate leases, separate namespaces).
 *  2. Cross-account state collision prevented (composite owner+workspace keys).
 *  3. Unauthorized access refused (no membership / viewer role).
 *  4. Denial after membership revocation (getWorkspaceAccess returns null).
 *  5. Lease contention (second active lease on same owner+workspace → conflict).
 *  6. Stale-generation rejection.
 *  7. Quota exhaustion (max concurrent guests per account).
 *  8. Destroy failure quarantines guest in 'error'; reconcile recovers it.
 *  9. Safe recovery after suspend/resume.
 *
 * Provider and admission are mocked; no real Supabase or Daytona calls.
 * Note: the route's isEnabled() additionally rejects mock providers and
 * requires both feature flags — that gate is asserted separately.
 */
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
}));
jest.mock('@/lib/intelligence/execution/accountCompute/lifecycle', () => ({
  ENABLE_ACCOUNT_COMPUTE_LIFECYCLE: true,
}));

function resetAll() {
  // Fresh module instance per test so no cross-test state leakage.
  jest.resetModules();
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

describe('A3 — cross-account isolation', () => {
  it('two users sharing a workspaceId never collide (composite owner+workspace keys)', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const a = await sup.createWorkspaceGuest('user_A', 'shared-ws', 'ws-ns-a', scope('user_A', 'shared-ws'), 0);
    const b = await sup.createWorkspaceGuest('user_B', 'shared-ws', 'ws-ns-b', scope('user_B', 'shared-ws'), 0);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.state!.ownerUserId).toBe('user_A');
    expect(b.state!.ownerUserId).toBe('user_B');
    expect(sup.getLease('user_A', 'shared-ws')!.ownerUserId).toBe('user_A');
    expect(sup.getState('user_B', 'shared-ws')!.ownerUserId).toBe('user_B');
    expect(sup.getLease('user_A', 'shared-ws')!.generation).toBe(1);
    expect(sup.getLease('user_B', 'shared-ws')!.generation).toBe(1);
  });

  it('user_B cannot operate on user_A guest with the same workspaceId', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);

    const inspect = await sup.inspectWorkspaceGuest('user_B', 'ws-a', 0);
    expect(inspect.ok).toBe(false);
    expect(inspect.reason).toBe('no active lease');
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

    (getWorkspaceAccess as jest.Mock).mockResolvedValueOnce({
      workspaceId: 'ws-a', userId: 'user_A', role: 'member',
      permissions: ['workspace:read', 'repository:link', 'repository:unlink', 'memory:read', 'memory:write', 'document:read', 'document:write'],
      source: 'workspace_members',
    } as any);

    const before = await admitWorkspace('user_A', 'ws-a');
    expect(before.allowed).toBe(true);

    (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);

    const after = await admitWorkspace('user_A', 'ws-a');
    expect(after.allowed).toBe(false);
    expect(after.reason).toBe('access denied');
  });
});

describe('A3 — lease contention', () => {
  it('rejects a second active lease on the same owner+workspace', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const first = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(first.ok).toBe(true);

    const second = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 1);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('lease held');
    expect(provider.createGuest).toHaveBeenCalledTimes(1);
  });
});

describe('A3 — stale generation rejection', () => {
  it('rejects operations with a stale generation', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const created = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(created.ok).toBe(true);

    const inspect = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 0);
    expect(inspect.ok).toBe(false);
    expect(inspect.reason).toBe('stale generation');
    expect(inspect.generation).toBe(1);

    const ok = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 1);
    expect(ok.ok).toBe(true);
  });
});

describe('A3 — quota exhaustion', () => {
  it('rejects creates past maxConcurrentGuests per account', async () => {
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
    expect(provider.createGuest).toHaveBeenCalledTimes(2);

    // Other account is unaffected (per-account quota).
    const r4 = await sup.createWorkspaceGuest('user_B', 'ws-x', 'ws-ns-x', scope('user_B', 'ws-x'), 0);
    expect(r4.ok).toBe(true);
  });
});

describe('A3 — destroy failure quarantine + reconcile', () => {
  it('failed destroy quarantines guest in error state instead of dropping it', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    provider.destroyGuest.mockRejectedValue(new Error('provider destroy failed'));
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const created = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    expect(created.ok).toBe(true);

    const destroyed = await sup.destroyWorkspaceGuest('user_A', 'ws-a', 1);
    expect(destroyed.ok).toBe(false);
    expect(destroyed.reason).toBe('provider destroy failed');

    const inspect = await sup.inspectWorkspaceGuest('user_A', 'ws-a', 1);
    expect(inspect.ok).toBe(true);
    expect(inspect.state!.phase).toBe('error');
  });

  it('recover recovers quarantined guest when provider reports healthy', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    provider.destroyGuest.mockRejectedValue(new Error('provider destroy failed'));
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    await sup.destroyWorkspaceGuest('user_A', 'ws-a', 1);

    const recovered = await sup.reconcileWorkspaceGuest('user_A', 'ws-a');
    expect(recovered.ok).toBe(true);
    expect(recovered.state!.phase).toBe('running');
  });

  it('reconcile keeps error state when provider is unhealthy', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    provider.destroyGuest.mockRejectedValue(new Error('provider destroy failed'));
    provider.healthGuest.mockResolvedValue({ healthy: false });
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope('user_A', 'ws-a'), 0);
    await sup.destroyWorkspaceGuest('user_A', 'ws-a', 1);

    const recovered = await sup.reconcileWorkspaceGuest('user_A', 'ws-a');
    expect(recovered.ok).toBe(true);
    expect(recovered.state!.phase).toBe('error');
  });

  it('reconcile on nonexistent guest is a no-op', async () => {
    const { GuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/guest');
    const provider = makeGuestProvider();
    const sup = new GuestSupervisor(provider, { maxConcurrentGuests: 10, leaseTtlMs: 300_000 });

    const result = await sup.reconcileWorkspaceGuest('user_A', 'unknown-ws');
    expect(result.ok).toBe(true);
    expect(result.state).toBeUndefined();
  });
});

describe('A3 — suspend / resume recovery', () => {
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

// Keep test helpers scoped to this file instead of TypeScript's global script scope.
export {};
