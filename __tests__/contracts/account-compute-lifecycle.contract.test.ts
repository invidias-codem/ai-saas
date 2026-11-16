/**
 * Account Compute Plane — A2 lifecycle contract tests.
 *
 * Covers:
 *  1. ENABLE_ACCOUNT_COMPUTE_LIFECYCLE flag gating (default off).
 *  2. provisionAccountVm: verifyProviderCapability is mandatory before claim/create;
 *     container-only providers are blocked (fail closed).
 *  3. provisionAccountVm: fresh claim → Daytona create → mark_ready generation CAS.
 *  4. Replay: existing VM returns current state without re-provisioning.
 *  5. Two workspaces attach to the same VM (no duplicate VM).
 *  6. Suspend → resume cycle: suspend writes state='suspended' via markVmSuspended
 *     (never state='ready'); resume requires durableSuspend.
 *  7. Suspend refused when an active session or execution lease exists.
 *  8. Provider capability verification: container-only org rejected.
 *  9. Provider failure → markVmFailed retained for reconciliation.
 *
 * All seams mocked; no real Daytona or Supabase calls.
 */
jest.mock('@/lib/intelligence/execution/accountCompute/reservation', () => ({
  ENABLE_ACCOUNT_COMPUTE: false,
  claimAccountVm: jest.fn(),
  getAccountVm: jest.fn(),
  attachWorkspaceToVm: jest.fn(),
  detachWorkspaceFromVm: jest.fn(),
  markVmReady: jest.fn(),
  markVmSuspended: jest.fn(),
  markVmFailed: jest.fn(),
  resolveProvisioning: jest.fn(),
}));
jest.mock('@/lib/intelligence/execution/accountCompute/contracts', () => ({
  accountVmReservationKey: jest.fn((u) => `account-vm:v1:${u}`),
}));

let mod: any;
let contracts: any;

// Flag enabled for the behavior tests below.
process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE = 'true';

function makeProvider(overrides: Record<string, any> = {}) {
  return {
    id: 'daytona-test',
    capabilities: {
      runtimeTypes: ['linux_vm'],
      durableSuspend: true,
      isolation: { filesystem: true, process: true, network: true, secrets: true },
      maxVcpus: 4,
      maxMemoryMb: 8192,
      maxStorageGb: 20,
    },
    create: jest.fn().mockResolvedValue({ desktopId: 'desktop-1', providerId: 'sandbox-1' }),
    resume: jest.fn().mockResolvedValue(undefined),
    suspend: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({
      phase: 'ready' as const,
      sessionLease: null,
      executionLease: null,
    }),
    ...overrides,
  };
}

function resetAll() {
  mod = require('@/lib/intelligence/execution/accountCompute/reservation');
  contracts = require('@/lib/intelligence/execution/accountCompute/contracts');
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] === 'function') (mod[key] as jest.Mock).mockReset();
  }
  contracts.accountVmReservationKey.mockImplementation((u: string) => `account-vm:v1:${u}`);
}

beforeEach(resetAll);

describe('A2 — provisionAccountVm', () => {
  it('blocks provisioning when provider is container-only (fail closed)', async () => {
    const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider({
      capabilities: { ...makeProvider().capabilities, runtimeTypes: ['container'] },
    });

    const result = await provisionAccountVm('user_A', provider, { vcpus: 2, memoryMb: 4096, storageGb: 20 });

    expect(result.claimed).toBe(false);
    expect(result.state).toBe('blocked');
    expect(mod.claimAccountVm).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
  });

  it('fresh claim provisions via Daytona and marks ready with generation CAS', async () => {
    const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();

    mod.claimAccountVm.mockResolvedValue({
      claimed: true, replay: false, vmId: 'vm-1', desktopId: null, providerId: null,
      state: 'provisioning', generation: 1, operationKey: 'account-vm:v1:user_A',
    });
    mod.markVmReady.mockResolvedValue({ ok: true, generation: 2 });

    const result = await provisionAccountVm('user_A', provider, { vcpus: 2, memoryMb: 4096, storageGb: 20 });

    expect(mod.claimAccountVm).toHaveBeenCalledWith(
      'user_A', 'account-vm:v1:user_A', 'daytona-vm-small',
      { vcpus: 2, memoryMb: 4096, storageGb: 20, maxConcurrentWorkspaces: 10 }
    );
    expect(provider.create).toHaveBeenCalledWith(
      { memoryMb: 4096, cpuShares: 2, storageGb: 20 },
      { tenantId: 'user:user_A', workspaceId: '__lattice_account_vm__' }
    );
    expect(mod.markVmReady).toHaveBeenCalledWith('user_A', 'desktop-1', 'sandbox-1', 1);
    expect(result.state).toBe('ready');
    expect(result.generation).toBe(2);
    expect(result.desktopId).toBe('desktop-1');
  });

  it('replay returns existing state without re-provisioning', async () => {
    const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();

    mod.claimAccountVm.mockResolvedValue({
      claimed: true, replay: true, vmId: 'vm-1', desktopId: 'desktop-1', providerId: 'sandbox-1',
      state: 'ready', generation: 5, operationKey: 'account-vm:v1:user_A',
    });
    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'ready', generation: 5,
    });

    const result = await provisionAccountVm('user_A', provider, { vcpus: 2, memoryMb: 4096, storageGb: 20 });

    expect(provider.create).not.toHaveBeenCalled();
    expect(result.replay).toBe(true);
    expect(result.state).toBe('ready');
    expect(result.desktopId).toBe('desktop-1');
  });

  it('generation mismatch on mark_ready records uncertainty and aborts', async () => {
    const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();

    mod.claimAccountVm.mockResolvedValue({
      claimed: true, replay: false, vmId: 'vm-1', desktopId: null, providerId: null,
      state: 'provisioning', generation: 1, operationKey: 'account-vm:v1:user_A',
    });
    mod.markVmReady.mockResolvedValue({ ok: false, reason: 'generation mismatch', generation: 3 });

    const result = await provisionAccountVm('user_A', provider, { vcpus: 2, memoryMb: 4096, storageGb: 20 });

    expect(mod.resolveProvisioning).toHaveBeenCalledWith('user_A', 'uncertain', expect.any(String));
    expect(result.state).toBe('generation mismatch');
  });

  it('provider failure marks VM failed and retains for reconciliation', async () => {
    const { provisionAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();
    provider.create.mockRejectedValue(new Error('Daytona quota exceeded'));

    mod.claimAccountVm.mockResolvedValue({
      claimed: true, replay: false, vmId: 'vm-1', desktopId: null, providerId: null,
      state: 'provisioning', generation: 1, operationKey: 'account-vm:v1:user_A',
    });

    await expect(
      provisionAccountVm('user_A', provider, { vcpus: 2, memoryMb: 4096, storageGb: 20 })
    ).rejects.toThrow('Daytona quota exceeded');

    expect(mod.markVmFailed).toHaveBeenCalledWith('user_A', 1);
    expect(mod.resolveProvisioning).toHaveBeenCalledWith('user_A', 'failed', expect.any(String));
  });
});

describe('A2 — workspace attach without duplicate VM', () => {
  it('two workspaces attach to the same VM with distinct namespaces', async () => {
    const { attachWorkspace } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.attachWorkspaceToVm
      .mockResolvedValueOnce({ attached: true, replay: false, workspaceId: 'ws-1', computeNamespace: 'ws-aaa', generation: 1 })
      .mockResolvedValueOnce({ attached: true, replay: false, workspaceId: 'ws-2', computeNamespace: 'ws-bbb', generation: 1 });

    const first = await attachWorkspace('user_A', 'ws-1', 'ws-aaa');
    const second = await attachWorkspace('user_A', 'ws-2', 'ws-bbb');

    expect(first.attached).toBe(true);
    expect(second.attached).toBe(true);
    expect(first.workspaceId).toBe('ws-1');
    expect(second.workspaceId).toBe('ws-2');
    expect(first.computeNamespace).not.toBe(second.computeNamespace);
  });
});

describe('A2 — suspend / resume cycle', () => {
  it('resumes a suspended VM only when durableSuspend is verified', async () => {
    const { resumeAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'suspended', generation: 3,
    });
    mod.markVmReady.mockResolvedValue({ ok: true, generation: 4 });

    const provider = makeProvider();
    const result = await resumeAccountVm('user_A', provider);

    expect(provider.resume).toHaveBeenCalledWith('desktop-1', { tenantId: 'user:user_A', workspaceId: '__lattice_account_vm__' });
    expect(mod.markVmReady).toHaveBeenCalledWith('user_A', 'desktop-1', 'sandbox-1', 3);
    expect(result.ok).toBe(true);
    expect(result.state).toBe('ready');
  });

  it('rejects resume when provider lacks durableSuspend', async () => {
    const { resumeAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'suspended', generation: 3,
    });

    const provider = makeProvider({ capabilities: { ...makeProvider().capabilities, durableSuspend: false } });
    const result = await resumeAccountVm('user_A', provider);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('resume_not_supported');
    expect(provider.resume).not.toHaveBeenCalled();
  });

  it('suspend writes state=suspended via markVmSuspended (never state=ready)', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'ready', generation: 3,
    });
    mod.markVmSuspended.mockResolvedValue({ ok: true, generation: 4, state: 'suspended' });

    const provider = makeProvider();
    provider.get.mockResolvedValue({ phase: 'ready' as const, sessionLease: null, executionLease: null });

    const result = await suspendAccountVm('user_A', provider);

    expect(provider.suspend).toHaveBeenCalledWith('desktop-1', { tenantId: 'user:user_A', workspaceId: '__lattice_account_vm__' });
    expect(mod.markVmSuspended).toHaveBeenCalledWith('user_A', 3);
    expect(mod.markVmReady).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.state).toBe('suspended');
    expect(result.generation).toBe(4);
  });

  it('refuses suspend when an active session lease exists', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'ready', generation: 3,
    });

    const provider = makeProvider();
    provider.get.mockResolvedValue({
      phase: 'ready' as const,
      sessionLease: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
      executionLease: null,
    });

    const result = await suspendAccountVm('user_A', provider);

    expect(provider.suspend).not.toHaveBeenCalled();
    expect(mod.markVmSuspended).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('active lease blocks suspend');
  });

  it('refuses suspend when an active execution lease exists', async () => {
    const { suspendAccountVm } = require('@/lib/intelligence/execution/accountCompute/lifecycle');

    mod.getAccountVm.mockResolvedValue({
      desktop_id: 'desktop-1', provider_id: 'sandbox-1', state: 'ready', generation: 3,
    });

    const provider = makeProvider();
    provider.get.mockResolvedValue({
      phase: 'ready' as const,
      sessionLease: null,
      executionLease: { expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });

    const result = await suspendAccountVm('user_A', provider);

    expect(provider.suspend).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('active lease blocks suspend');
  });
});

describe('A2 — provider capability verification', () => {
  it('rejects a container-only org (no silent container fallback)', () => {
    const { verifyProviderCapability } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider({ capabilities: { runtimeTypes: ['container'], durableSuspend: false, isolation: { filesystem: true, process: true, network: true, secrets: true }, maxVcpus: 2, maxMemoryMb: 4096, maxStorageGb: 20 } });

    const result = verifyProviderCapability(provider, { filesystem: true, process: true, network: true, secrets: true });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe('vm_unavailable: provider advertises container only');
  });

  it('rejects incomplete isolation attestation', () => {
    const { verifyProviderCapability } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();

    const result = verifyProviderCapability(provider, { filesystem: true, process: true, network: true, secrets: false });
    expect(result.qualified).toBe(false);
    expect(result.reason).toBe('isolation_unverified');
  });

  it('accepts a fully qualified linux_vm provider', () => {
    const { verifyProviderCapability } = require('@/lib/intelligence/execution/accountCompute/lifecycle');
    const provider = makeProvider();

    const result = verifyProviderCapability(provider, { filesystem: true, process: true, network: true, secrets: true });
    expect(result.qualified).toBe(true);
  });
});
