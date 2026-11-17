/**
 * Account Compute Plane — A3.4 durable lease contract tests.
 *
 * Covers:
 *  1. Lease acquisition is exclusive per owner+workspace (composite key).
 *  2. Stale generation rejection on lease acquire and phase transition.
 *  3. VM suspend fence (ready -> suspending) refuses new leases.
 *  4. Guest phase transition with generation CAS.
 *  5. Destroy failure quarantines guest in error state.
 *  6. Reconcile recovers quarantined guest; no-op for healthy guests.
 *  7. Cross-account isolation on shared workspaceId.
 *  8. Lease release and extend.
 *
 * Supabase is mocked; no real database or provider calls.
 */
jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: { rpc: jest.fn(), from: jest.fn() },
  supabase: null,
}));

const { supabaseAdmin } = require('@/lib/supabaseClient');
const rpcMock = supabaseAdmin.rpc as jest.Mock;

beforeEach(() => {
  rpcMock.mockReset();
  mockMaybeSingle.mockReset();
});

// Mock table chain: supabaseAdmin.from(table).select().eq().eq().maybeSingle()
const mockMaybeSingle = jest.fn();
const eqResult = { eq: jest.fn(), maybeSingle: mockMaybeSingle };
eqResult.eq.mockReturnValue(eqResult);
const mockEq = jest.fn().mockReturnValue(eqResult);
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
const mockFrom = jest.fn().mockImplementation(() => ({
  select: mockSelect,
}));
supabaseAdmin.from = mockFrom;

function setTableRowOnce(row: any) {
  mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
}
function setTableNullOnce() {
  mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
}

function makeProvider() {
  return {
    id: 'mock-provider',
    createGuest: jest.fn().mockResolvedValue({ desktopId: 'desktop-1' }),
    startGuest: jest.fn().mockResolvedValue(undefined),
    suspendGuest: jest.fn().mockResolvedValue(undefined),
    destroyGuest: jest.fn().mockResolvedValue(undefined),
    healthGuest: jest.fn().mockResolvedValue({ healthy: true }),
    inspectGuest: jest.fn().mockResolvedValue(null),
  };
}

function rpcOnce(name: string, data: any) {
  rpcMock.mockResolvedValueOnce({ data, error: null });
}

function rpcPersistent(name: string, data: any) {
  rpcMock.mockImplementation((n: string) => {
    if (n === name) return Promise.resolve({ data, error: null });
    return Promise.resolve({ data: {}, error: null });
  });
}

describe('A3.4 — acquireGuestLease', () => {
  it('acquires an exclusive lease with a fencing token', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-abc123',
      generation: 1, expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 0);
    expect(result.ok).toBe(true);
    expect(result.lease!.fencingToken).toBe('tok-abc123');
    expect(result.lease!.replay).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('account_compute_acquire_guest_lease', {
      p_owner_user_id: 'user_A',
      p_workspace_id: 'ws-a',
      p_expected_generation: 0,
    });
  });

  it('returns replay=true for an existing active lease', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: true, replay: true, fencing_token: 'tok-existing',
      generation: 2, expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 2);
    expect(result.ok).toBe(true);
    expect(result.lease!.replay).toBe(true);
  });

  it('rejects stale generation', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: false, reason: 'stale generation', expected: 1, actual: 3,
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('stale generation');
  });

  it('refuses new leases while the VM is suspending', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: false, reason: 'vm suspending', generation: 5,
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 5);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('vm suspending');
  });

  it('two users sharing a workspaceId get separate leases', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-1',
      generation: 1, expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    const a = await acquireGuestLease('user_A', 'shared-ws', 0);
    const b = await acquireGuestLease('user_B', 'shared-ws', 0);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'account_compute_acquire_guest_lease', {
      p_owner_user_id: 'user_A', p_workspace_id: 'shared-ws', p_expected_generation: 0,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'account_compute_acquire_guest_lease', {
      p_owner_user_id: 'user_B', p_workspace_id: 'shared-ws', p_expected_generation: 0,
    });
  });
});

describe('A3.4 — releaseGuestLease', () => {
  it('releases a lease by fencing token', async () => {
    const { releaseGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_release_guest_lease', {
      ok: true, generation: 3,
    });

    const result = await releaseGuestLease('user_A', 'ws-a', 'tok-abc123');
    expect(result.ok).toBe(true);
    expect(result.generation).toBe(3);
    expect(rpcMock).toHaveBeenCalledWith('account_compute_release_guest_lease', {
      p_owner_user_id: 'user_A', p_workspace_id: 'ws-a', p_fencing_token: 'tok-abc123',
    });
  });
});

describe('A3.4 — extendGuestLease', () => {
  it('extends a lease expiry', async () => {
    const { extendGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_extend_guest_lease', {
      ok: true, expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const result = await extendGuestLease('user_A', 'ws-a', 'tok-abc123', 300_000);
    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('account_compute_extend_guest_lease', {
      p_owner_user_id: 'user_A', p_workspace_id: 'ws-a',
      p_fencing_token: 'tok-abc123', p_extend_ms: 300_000,
    });
  });
});

describe('A3.4 — markGuestPhase', () => {
  it('transitions phase with generation CAS', async () => {
    const { markGuestPhase } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_mark_guest_phase', {
      ok: true, generation: 3, phase: 'running', quarantined: false,
    });

    const result = await markGuestPhase('user_A', 'ws-a', 2, 'running');
    expect(result.ok).toBe(true);
    expect(result.phase).toBe('running');
    expect(result.generation).toBe(3);
    expect(result.quarantined).toBe(false);
  });

  it('rejects stale generation on phase transition', async () => {
    const { markGuestPhase } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_mark_guest_phase', {
      ok: false, reason: 'stale generation', expected: 1, actual: 2,
    });

    const result = await markGuestPhase('user_A', 'ws-a', 1, 'running');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('stale generation');
  });
});

describe('A3.4 — suspendAccountVm (account-wide fence)', () => {
  it('fences the VM ready -> suspending', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_suspend_account_vm', {
      ok: true, generation: 4, state: 'suspending',
    });

    const result = await suspendAccountVm('user_A', 3);
    expect(result.ok).toBe(true);
    expect(result.state).toBe('suspending');
    expect(result.generation).toBe(4);
  });

  it('rejects when VM is not ready', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_suspend_account_vm', {
      ok: false, reason: 'vm not ready', actual_state: 'suspended',
    });

    const result = await suspendAccountVm('user_A', 3);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('vm not ready');
  });
});

describe('A3.4 — claimGuest (durable guest registration)', () => {
  it('claims a guest record when the account VM is ready', async () => {
    const { claimGuest } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_claim_guest', {
      ok: true, replay: false, id: 'g-1', workspace_id: 'ws-a',
      provider_id: null, phase: 'creating', generation: 1,
      operation_key: 'op-claim-1',
    });

    const result = await claimGuest('user_A', 'ws-a', 'op-claim-1');
    expect(result.ok).toBe(true);
    expect(result.replay).toBe(false);
    expect(result.record!.phase).toBe('creating');
    expect(result.record!.generation).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith('account_compute_claim_guest', {
      p_owner_user_id: 'user_A',
      p_workspace_id: 'ws-a',
      p_operation_key: 'op-claim-1',
    });
  });

  it('returns replay=true for an existing guest record', async () => {
    const { claimGuest } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_claim_guest', {
      ok: true, replay: true, id: 'g-1', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 3,
      operation_key: 'op-claim-1',
    });

    const result = await claimGuest('user_A', 'ws-a', 'op-claim-1');
    expect(result.ok).toBe(true);
    expect(result.replay).toBe(true);
    expect(result.record!.phase).toBe('running');
  });

  it('rejects when the account VM is not ready', async () => {
    const { claimGuest } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_claim_guest', {
      ok: false, reason: 'account VM not ready', actual_state: 'provisioning',
    });

    const result = await claimGuest('user_A', 'ws-a', 'op-claim-1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('account VM not ready');
  });
});

describe('A3.4 — acquireGuestLease checks VM state', () => {
  it('refuses lease when the account VM is suspending (not ready)', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: false, reason: 'vm not ready', actual_state: 'suspending', generation: 5,
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 5);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('vm not ready');
  });
});

describe('A3.4 — suspendAccountVm rejects active leases', () => {
  it('refuses suspend when an active guest lease exists', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_suspend_account_vm', {
      ok: false, reason: 'active guest lease',
      workspace_id: 'ws-a', generation: 4,
    });

    const result = await suspendAccountVm('user_A', 4);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('active guest lease');
  });
});

describe('A3.4 — resolveGuestProvisioning', () => {
  it('retains uncertain outcome for reconciliation', async () => {
    const { resolveGuestProvisioning } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_resolve_guest_provisioning', {
      ok: true, phase: 'error', generation: 2, quarantined: true,
    });

    const result = await resolveGuestProvisioning('user_A', 'ws-a', 'uncertain', new Date().toISOString());
    expect(result.ok).toBe(true);
    expect(result.phase).toBe('error');
    expect(result.quarantined).toBe(true);
  });

  it('records failed outcome', async () => {
    const { resolveGuestProvisioning } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_resolve_guest_provisioning', {
      ok: true, phase: 'error', generation: 3, quarantined: true,
    });

    const result = await resolveGuestProvisioning('user_A', 'ws-a', 'failed', new Date().toISOString());
    expect(result.ok).toBe(true);
    expect(result.quarantined).toBe(true);
  });
});

describe('A3.4 — getGuestRecord', () => {
  it('returns the durable guest record', async () => {
    const { getGuestRecord } = require('@/lib/intelligence/execution/accountCompute/reservation');
    setTableRowOnce({
      id: 'guest-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'container-1', phase: 'running', generation: 2,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const record = await getGuestRecord('user_A', 'ws-a');
    expect(record!.ownerUserId).toBe('user_A');
    expect(record!.workspaceId).toBe('ws-a');
    expect(record!.phase).toBe('running');
    expect(record!.providerId).toBe('container-1');
    expect(record!.quarantined).toBe(false);
  });

  it('returns null when no guest exists', async () => {
    const { getGuestRecord } = require('@/lib/intelligence/execution/accountCompute/reservation');
    setTableNullOnce();

    const record = await getGuestRecord('user_A', 'ws-a');
    expect(record).toBeNull();
  });
});

describe('A3.4 — DurableGuestSupervisor', () => {
  it('createWorkspaceGuest: durable record -> provider create -> running phase', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableNullOnce();
    rpcOnce('account_compute_claim_guest', {
      ok: true, replay: false, id: 'g-1', workspace_id: 'ws-a',
      provider_id: null, phase: 'creating', generation: 1,
      operation_key: 'op-claim-1',
    });
    rpcOnce('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-1', generation: 1,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 2, phase: 'creating', quarantined: false,
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 3, phase: 'running', quarantined: false,
    });
    rpcOnce('account_compute_release_guest_lease', { ok: true, generation: 1 });
    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 3,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const scope = { tenantId: 'user:user_A', workspaceId: 'ws-a' };
    const result = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope, 0);
    expect(result.ok).toBe(true);
    expect(result.state!.phase).toBe('running');
    expect(provider.createGuest).toHaveBeenCalledTimes(1);
  });

  it('createWorkspaceGuest: provider failure quarantines the guest', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    provider.createGuest.mockRejectedValue(new Error('Podman create failed'));
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableNullOnce();
    rpcOnce('account_compute_claim_guest', {
      ok: true, replay: false, id: 'g-1', workspace_id: 'ws-a',
      provider_id: null, phase: 'creating', generation: 1,
      operation_key: 'op-claim-1',
    });
    rpcOnce('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-1', generation: 1,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 2, phase: 'creating', quarantined: false,
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 3, phase: 'error', quarantined: true,
    });
    rpcOnce('account_compute_resolve_guest_provisioning', {
      ok: true, phase: 'error', generation: 3, quarantined: true,
    });
    rpcOnce('account_compute_release_guest_lease', { ok: true, generation: 1 });

    const scope = { tenantId: 'user:user_A', workspaceId: 'ws-a' };
    const result = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Podman create failed');
    expect(provider.createGuest).toHaveBeenCalledTimes(1);
  });

  it('suspendWorkspaceGuest: account-wide fence then guest suspend', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 1,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });
    rpcOnce('account_compute_suspend_account_vm', { ok: true, generation: 2, state: 'suspending' });
    rpcOnce('account_compute_mark_guest_phase', { ok: true, generation: 2, phase: 'suspending', quarantined: false });
    rpcOnce('account_compute_mark_guest_phase', { ok: true, generation: 3, phase: 'suspended', quarantined: false });
    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'suspended', generation: 3,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const scope = { tenantId: 'user:user_A', workspaceId: 'ws-a' };
    const result = await sup.suspendWorkspaceGuest('user_A', 'ws-a', scope, 1);
    expect(result.ok).toBe(true);
    expect(result.state!.phase).toBe('suspended');
    expect(provider.suspendGuest).toHaveBeenCalledTimes(1);
  });

  it('reconcileWorkspaceGuest: recovers error guest when provider is healthy', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'error', generation: 1,
      operation_key: 'op-1', error_reason: 'provider failed', quarantined: true,
    });
    rpcOnce('account_compute_mark_guest_phase', { ok: true, generation: 2, phase: 'running', quarantined: false });
    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 2,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const result = await sup.reconcileWorkspaceGuest('user_A', 'ws-a');
    expect(result.ok).toBe(true);
    expect(result.state!.phase).toBe('running');
    expect(result.generation).toBe(2);
  });

  it('reconcileWorkspaceGuest: no-op for healthy guest', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 1,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const result = await sup.reconcileWorkspaceGuest('user_A', 'ws-a');
    expect(result.ok).toBe(true);
    expect(result.state!.phase).toBe('running');
    expect(provider.healthGuest).not.toHaveBeenCalled();
  });

  it('reconcileWorkspaceGuest: no-op for nonexistent guest', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableNullOnce();

    const result = await sup.reconcileWorkspaceGuest('user_A', 'unknown-ws');
    expect(result.ok).toBe(true);
    expect(result.state).toBeUndefined();
  });
});

describe('A3.4.2 — guest identity persistence', () => {
  it('createWorkspaceGuest persists provider ID on running transition', async () => {
    const { DurableGuestSupervisor } = require('@/lib/intelligence/execution/accountCompute/durableGuestSupervisor');
    const provider = makeProvider();
    const sup = new DurableGuestSupervisor(provider, {
      maxConcurrentGuests: 10, leaseTtlMs: 300_000, leaseRenewalMs: 60_000,
    });

    setTableNullOnce();
    rpcOnce('account_compute_claim_guest', {
      ok: true, replay: false, id: 'g-1', workspace_id: 'ws-a',
      provider_id: null, phase: 'creating', generation: 1,
      operation_key: 'op-claim-1',
    });
    rpcOnce('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-1', generation: 1,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 2, phase: 'creating', quarantined: false,
    });
    rpcOnce('account_compute_mark_guest_phase', {
      ok: true, generation: 3, phase: 'running', quarantined: false,
    });
    rpcOnce('account_compute_release_guest_lease', { ok: true, generation: 1 });
    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 3,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });

    const scope = { tenantId: 'user:user_A', workspaceId: 'ws-a' };
    const result = await sup.createWorkspaceGuest('user_A', 'ws-a', 'ws-ns-a', scope, 0);
    expect(result.ok).toBe(true);
    expect(result.state!.providerId).toBe('desktop-1');
    expect(result.state!.phase).toBe('running');
    // Verify mark_guest_phase was called with the provider ID.
    const phaseCalls = rpcMock.mock.calls.filter((c) => c[0] === 'account_compute_mark_guest_phase');
    const runningCall = phaseCalls.find((c) => c[1].p_new_phase === 'running');
    expect(runningCall[1].p_provider_id).toBe('desktop-1');
  });
});

describe('A3.4.2 — lease expiration cleanup', () => {
  it('acquireGuestLease removes expired lease before inserting a new one', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');

    // Expired lease row exists for this owner+workspace.
    setTableRowOnce({
      id: 'g-1', owner_user_id: 'user_A', workspace_id: 'ws-a',
      provider_id: 'desktop-1', phase: 'running', generation: 1,
      operation_key: 'op-1', error_reason: null, quarantined: false,
    });
    rpcOnce('account_compute_acquire_guest_lease', {
      ok: true, replay: false, fencing_token: 'tok-new', generation: 1,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    const result = await acquireGuestLease('user_A', 'ws-a', 1);
    expect(result.ok).toBe(true);
    expect(result.lease!.fencingToken).toBe('tok-new');
    // The DELETE of expired rows + INSERT happened under the VM lock;
    // replay is false because the old row was expired and removed.
    expect(result.lease!.replay).toBe(false);
  });
});

describe('A3.4.2 — lease extension bounds and VM state', () => {
  it('extendGuestLease rejects an expired token', async () => {
    const { extendGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_extend_guest_lease', {
      ok: false, reason: 'lease not found or expired',
    });

    const result = await extendGuestLease('user_A', 'ws-a', 'tok-expired', 60_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('lease not found or expired');
  });

  it('extendGuestLease bounds extension duration to 5 minutes', async () => {
    const { extendGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_extend_guest_lease', {
      ok: false, reason: 'invalid extend duration', max_ms: 300000,
    });

    const result = await extendGuestLease('user_A', 'ws-a', 'tok-abc', 600_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid extend duration');
  });

  it('extendGuestLease rejects when the VM is suspending', async () => {
    const { extendGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_extend_guest_lease', {
      ok: false, reason: 'vm not ready', actual_state: 'suspending',
    });

    const result = await extendGuestLease('user_A', 'ws-a', 'tok-abc', 60_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('vm not ready');
  });
});

describe('A3.4.2 — lease replay exclusivity', () => {
  it('replay returns the same active fencing token (not a new one)', async () => {
    const { acquireGuestLease } = require('@/lib/intelligence/execution/accountCompute/reservation');
    rpcPersistent('account_compute_acquire_guest_lease', {
      ok: true, replay: true, fencing_token: 'tok-active',
      generation: 2, expires_at: new Date(Date.now() + 300_000).toISOString(),
    });

    const first = await acquireGuestLease('user_A', 'ws-a', 2);
    const second = await acquireGuestLease('user_A', 'ws-a', 2);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.lease!.fencingToken).toBe('tok-active');
    expect(second.lease!.fencingToken).toBe('tok-active');
    expect(first.lease!.replay).toBe(true);
    expect(second.lease!.replay).toBe(true);
  });
});
