import {
  ACCOUNT_VM_VDI_WORKSPACE_ID,
  accountVmReservationKey,
  accountVmVdiScope,
  workspaceComputeNamespace,
  planAccountCompute,
  type AccountComputeRequest,
} from '@/lib/intelligence/execution/accountCompute/contracts';

function request(overrides: Partial<AccountComputeRequest> = {}): AccountComputeRequest {
  return {
    requesterUserId: 'user_A',
    ownerUserId: 'user_A',
    workspaceId: 'workspace_1',
    workspaceRole: 'owner',
    featureEnabled: true,
    provider: {
      runtimeTypes: ['linux_vm'],
      durableSuspend: true,
      isolation: { filesystem: true, process: true, network: true, secrets: true },
      maxVcpus: 4,
      maxMemoryMb: 8192,
      maxStorageGb: 20,
    },
    entitlement: { vcpus: 2, memoryMb: 4096, storageGb: 8, maxConcurrentWorkspaces: 1 },
    existingVm: null,
    ...overrides,
  };
}

describe('Account Compute Plane — A0 contract', () => {
  it('scopes one stable VM allocation to the account, not its workspaces', () => {
    const first = planAccountCompute(request({ workspaceId: 'workspace_1' }));
    const second = planAccountCompute(request({ workspaceId: 'workspace_2' }));
    expect(first.action).toBe('provision');
    expect(second.action).toBe('provision');
    expect(first.accountKey).toBe(second.accountKey);
    expect(first.vdiScope).toEqual(second.vdiScope);
    expect(first.workspaceNamespace).not.toBe(second.workspaceNamespace);
    // The caller MUST claim accountKey in a unique database record before provisioning.
  });

  it('never shares the account machine or namespace across users', () => {
    const alice = planAccountCompute(request());
    const bob = planAccountCompute(request({
      requesterUserId: 'user_B', ownerUserId: 'user_B', workspaceRole: 'member',
    }));
    expect(alice.accountKey).not.toBe(bob.accountKey);
    expect(alice.vdiScope).not.toEqual(bob.vdiScope);
    expect(alice.workspaceNamespace).not.toBe(bob.workspaceNamespace);
  });

  it('uses a reserved broker workspace scope, not a real user workspace', () => {
    expect(accountVmVdiScope('user_A')).toEqual({
      tenantId: 'user:user_A', workspaceId: ACCOUNT_VM_VDI_WORKSPACE_ID,
    });
    expect(accountVmReservationKey('user_A')).toBe(accountVmReservationKey('user_A'));
    expect(workspaceComputeNamespace('user_A', 'ws')).toMatch(/^ws-[0-9a-f]{32}$/);
    expect(() => workspaceComputeNamespace('user_A', ACCOUNT_VM_VDI_WORKSPACE_ID)).toThrow();
  });

  it('denies requests without an accepted, execution-capable workspace role', () => {
    expect(planAccountCompute(request({ workspaceRole: null })).reason).toBe('access_denied');
    expect(planAccountCompute(request({ workspaceRole: 'viewer' })).reason).toBe('access_denied');
    expect(planAccountCompute(request({ requesterUserId: 'other' })).reason).toBe('access_denied');
    expect(planAccountCompute(request({ workspaceId: ' ' })).reason).toBe('access_denied');
  });

  it('is dark by default at the feature gate', () => {
    expect(planAccountCompute(request({ featureEnabled: false }))).toEqual({
      action: 'blocked', reason: 'feature_disabled',
    });
  });

  it('does not accept an existing Daytona container as a VM', () => {
    const provider = { ...request().provider, runtimeTypes: ['container'] as const };
    expect(planAccountCompute(request({ provider })).reason).toBe('vm_unavailable');
    const existingVm = {
      ownerUserId: 'user_A', desktopId: 'desktop1',
      phase: 'ready' as const, runtimeType: 'container' as const,
    };
    expect(planAccountCompute(request({ existingVm })).reason).toBe('legacy_runtime_rejected');
  });

  it.each(['filesystem', 'process', 'network', 'secrets'] as const)(
    'requires verified %s isolation between workspaces', (axis) => {
      const standard = request().provider;
      const provider = { ...standard, isolation: { ...standard.isolation, [axis]: false } };
      expect(planAccountCompute(request({ provider }))).toEqual({
        action: 'blocked', reason: 'isolation_unverified',
      });
    },
  );

  it('enforces account-level resource ceilings and rejects invalid plans', () => {
    expect(planAccountCompute(request({
      entitlement: { vcpus: 8, memoryMb: 4096, storageGb: 8, maxConcurrentWorkspaces: 1 },
    })).reason).toBe('quota_unavailable');
    expect(planAccountCompute(request({
      entitlement: { vcpus: 1.5, memoryMb: 4096, storageGb: 8, maxConcurrentWorkspaces: 1 },
    })).reason).toBe('quota_unavailable');
  });

  it('reuses the same ready VM for new workspaces', () => {
    const existingVm = {
      ownerUserId: 'user_A', desktopId: 'desktop1',
      phase: 'ready' as const, runtimeType: 'linux_vm' as const,
    };
    const first = planAccountCompute(request({ workspaceId: 'one', existingVm }));
    const second = planAccountCompute(request({ workspaceId: 'two', existingVm }));
    expect(first.action).toBe('reuse');
    expect(second.action).toBe('reuse');
    expect(first.desktopId).toBe('desktop1');
    expect(second.desktopId).toBe('desktop1');
    expect(first.workspaceNamespace).not.toBe(second.workspaceNamespace);
  });

  it('waits for in-flight VM provisioning rather than starting another', () => {
    const existingVm = {
      ownerUserId: 'user_A', desktopId: 'desktop1',
      phase: 'provisioning' as const, runtimeType: 'linux_vm' as const,
    };
    expect(planAccountCompute(request({ existingVm })).action).toBe('wait');
  });

  it('only resumes a VM when durable suspend is verified', () => {
    const existingVm = {
      ownerUserId: 'user_A', desktopId: 'desktop1',
      phase: 'suspended' as const, runtimeType: 'linux_vm' as const,
    };
    expect(planAccountCompute(request({ existingVm })).action).toBe('resume');
    const provider = { ...request().provider, durableSuspend: false };
    expect(planAccountCompute(request({ existingVm, provider })).reason).toBe('resume_not_supported');
  });

  it('requires human-led reconciliation for failed/quarantined machines', () => {
    for (const phase of ['failed', 'quarantined', 'destroyed', 'degraded'] as const) {
      const existingVm = {
        ownerUserId: 'user_A', desktopId: 'desktop1',
        phase, runtimeType: 'linux_vm' as const,
      };
      expect(planAccountCompute(request({ existingVm })).reason).toBe('vm_needs_reconciliation');
    }
  });

  it('cannot adopt a VM belonging to another account', () => {
    const existingVm = {
      ownerUserId: 'user_B', desktopId: 'desktop1',
      phase: 'ready' as const, runtimeType: 'linux_vm' as const,
    };
    expect(planAccountCompute(request({ existingVm }))).toEqual({
      action: 'blocked', reason: 'owner_mismatch',
    });
  });
});
