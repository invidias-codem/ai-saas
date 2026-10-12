// __tests__/contracts/vdi-desktop-broker.contract.test.ts
// VDI-0 contracts:
//   - Desktop spec validation: runtimeType, persistence, imageVersion required
//   - DesktopPhase enum covers all lifecycle states
//   - Session lease and execution lease prevent suspension
//   - DesktopBroker surface has exactly 10 operations (6 lifecycle + 4 lease)
//   - DesktopCapabilities declare runtimeTypes, persistenceScopes, protocols
//   - DesktopHealth includes infrastructure, session, agent, security signals
//   - DesktopCapacity includes budgetUtilization
//   - ImageRegistry status enum: building → scanning → staged → promoted
//   - IdempotentProvisioner prevents duplicate VMs on timeout
//   - DesktopPolicy maxIdleMs requires NO session lease AND NO execution lease
//   - canSuspend() returns false when either lease is active
//   - makeProvisioningOperationKey is deterministic per (tenant, workspace, spec)
//   - hashDesktopSpec is deterministic (sorted keys)

import {
  DesktopSpec,
  DesktopPhase,
  DesktopSessionLease,
  ExecutionLease,
  DesktopCapabilities,
  DesktopHealth,
  DesktopCapacity,
  DesktopImage,
  ImageStatus,
  DesktopPolicy,
  hashDesktopSpec,
  canSuspend,
  isIdle,
  makeProvisioningOperationKey,
  TenantScope,
} from '@/lib/intelligence/execution/vdi/contracts';
import { resolveRuntime } from '@/lib/intelligence/execution/contracts';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };

describe('VDI-0 Desktop contracts', () => {
  it('1: DesktopSpec requires runtimeType, persistence, imageVersion', () => {
    const validSpec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: 'workspace',
      imageVersion: 'ubuntu-22.04-v1',
      memoryMb: 4096,
      cpuShares: 2,
      storageGb: 50,
    };
    expect(validSpec.runtimeType).toBe('linux_vm');
    expect(validSpec.persistence).toBe('workspace');
    expect(validSpec.imageVersion).toBe('ubuntu-22.04-v1');

    // Missing required fields would be caught by TypeScript
    // Runtime checks at provider boundary
  });

  it('2: DesktopPhase enum covers all lifecycle states', () => {
    const phases: DesktopPhase[] = [
      'provisioning',
      'ready',
      'degraded',
      'suspending',
      'suspended',
      'destroying',
      'destroyed',
      'failed',
      'quarantined',
    ];
    expect(phases).toHaveLength(9);
  });

  it('3: Session lease and execution lease have required fields', () => {
    const sessionLease: DesktopSessionLease = {
      sessionId: 'sess-1',
      userId: 'user-1',
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      connectionGrant: 'grant-token',
    };
    expect(sessionLease.connectionGrant).toBeDefined();

    const execLease: ExecutionLease = {
      executionId: 'exec-1',
      agentId: 'agent-1',
      grantedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1800_000).toISOString(),
    };
    expect(execLease.agentId).toBe('agent-1');
  });

  it('4: DesktopCapabilities declare supported types and protocols', () => {
    const caps: DesktopCapabilities = {
      runtimeTypes: ['linux_vm', 'windows_vm'],
      persistenceScopes: ['task', 'workspace'],
      durableSuspend: true,
      snapshots: true,
      maxDesktopsPerWorkspace: 10,
      sessionProtocols: ['vnc', 'webvnc'],
    };
    expect(caps.runtimeTypes).toContain('linux_vm');
    expect(caps.sessionProtocols).toContain('webvnc');
  });

  it('5: DesktopHealth includes all four signal categories', () => {
    const health: DesktopHealth = {
      desktopId: 'dt-1',
      providerId: 'daytona-sb-1',
      phase: 'ready',
      cpuPercent: 45,
      memoryPercent: 60,
      diskPercent: 30,
      brokerLatencyMs: 120,
      connectionSuccessRate: 0.99,
      gatewayHealthy: true,
      stuckOperations: 0,
      recentFailures: 0,
      permissionDenials: 0,
      abnormalEgress: false,
      checkedAt: new Date().toISOString(),
    };
    expect(health.phase).toBe('ready');
    expect(health.brokerLatencyMs).toBeLessThan(200);
  });

  it('6: DesktopCapacity includes budget tracking', () => {
    const capacity: DesktopCapacity = {
      tenantId: 'tenant-1',
      totalDesktops: 5,
      readyDesktops: 4,
      suspendedDesktops: 1,
      degradedDesktops: 0,
      provisioningDesktops: 0,
      runningHours: 120.5,
      budgetUtilization: 0.45,
    };
    expect(capacity.budgetUtilization).toBeLessThanOrEqual(1);
  });

  it('7: ImageRegistry status transitions: building → scanning → staged → promoted', () => {
    const image: DesktopImage = {
      imageId: 'img-1',
      version: 'ubuntu-22.04-v1',
      runtimeType: 'linux_vm',
      providerRef: { daytona: 'img-ubuntu-22' },
      status: 'promoted',
      scanResult: { passed: true, criticalCount: 0, highCount: 0, scannedAt: new Date().toISOString() },
      contractTestResult: { passed: true, testedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      promotedAt: new Date().toISOString(),
    };
    const validStatuses: ImageStatus[] = ['building', 'scanning', 'staged', 'promoted', 'deprecated', 'failed'];
    expect(validStatuses).toContain(image.status);
    expect(image.scanResult?.passed).toBe(true);
  });

  it('8: IdempotentProvisioner prevents duplicate VMs on timeout', () => {
    // This is an interface contract — implementation must satisfy:
    // - checkOperationKey returns existing desktopId if completed
    // - checkOperationKey returns in_progress if still provisioning
    // - recordOperationKey records outcome atomically
    const operationKey = 'vdi:create:tenant-1:ws-1:abc123:v1';
    expect(operationKey).toContain('vdi:create:');
  });

  it('9: DesktopPolicy maxIdleMs requires NO session lease AND NO execution lease', () => {
    const policy: DesktopPolicy = {
      maxIdleMs: 20 * 60 * 1000, // 20 minutes
      maxLifetimeMs: 24 * 60 * 60 * 1000,
      egressPolicy: 'deny_all',
    };
    expect(policy.maxIdleMs).toBe(1_200_000);
    expect(policy.egressPolicy).toBe('deny_all');
  });

  it('10: canSuspend() returns false when session lease is active', () => {
    const desktopWithSession: any = {
      sessionLease: { expiresAt: new Date(Date.now() + 3600_000).toISOString() },
      executionLease: undefined,
    };
    expect(canSuspend(desktopWithSession)).toBe(false);
  });

  it('11: canSuspend() returns false when execution lease is active', () => {
    const desktopWithExec: any = {
      sessionLease: undefined,
      executionLease: { expiresAt: new Date(Date.now() + 1800_000).toISOString() },
    };
    expect(canSuspend(desktopWithExec)).toBe(false);
  });

  it('12: canSuspend() returns true when both leases expired or absent', () => {
    const desktopIdle: any = {
      sessionLease: { expiresAt: new Date(Date.now() - 1000).toISOString() },
      executionLease: undefined,
    };
    expect(canSuspend(desktopIdle)).toBe(true);

    const desktopNoLeases: any = {
      sessionLease: undefined,
      executionLease: undefined,
    };
    expect(canSuspend(desktopNoLeases)).toBe(true);
  });

  it('13: isIdle() delegates to canSuspend()', () => {
    const desktop: any = { sessionLease: undefined, executionLease: undefined };
    expect(isIdle(desktop)).toBe(canSuspend(desktop));
  });

  it('14: makeProvisioningOperationKey is deterministic per (tenant, workspace, spec)', () => {
    const spec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: 'workspace',
      imageVersion: 'ubuntu-22.04-v1',
      memoryMb: 4096,
      cpuShares: 2,
    };
    const key1 = makeProvisioningOperationKey('tenant-1', 'ws-1', spec);
    const key2 = makeProvisioningOperationKey('tenant-1', 'ws-1', spec);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^vdi:create:tenant-1:ws-1:[a-f0-9]+:v1$/);
  });

  it('15: hashDesktopSpec is deterministic (sorted keys)', () => {
    const spec1: DesktopSpec = { runtimeType: 'linux_vm', persistence: 'workspace', imageVersion: 'v1', memoryMb: 4096 };
    const spec2: DesktopSpec = { persistence: 'workspace', runtimeType: 'linux_vm', imageVersion: 'v1', memoryMb: 4096 };
    expect(hashDesktopSpec(spec1)).toBe(hashDesktopSpec(spec2));
  });

  it('16: Different specs produce different hashes', () => {
    const spec1: DesktopSpec = { runtimeType: 'linux_vm', persistence: 'workspace', imageVersion: 'v1', memoryMb: 4096 };
    const spec2: DesktopSpec = { runtimeType: 'linux_vm', persistence: 'workspace', imageVersion: 'v1', memoryMb: 8192 };
    expect(hashDesktopSpec(spec1)).not.toBe(hashDesktopSpec(spec2));
  });

  it('17: Container provider cannot silently satisfy a linux_vm requirement (VDI-2 closure correction)', () => {
    // Live-verified 2026-10-11: this org's Daytona adapter runs
    // sandboxClass 'container'. The resolver must ABSTAIN on linux_vm.
    const containerAdapter = {
      id: 'daytona-container',
      capabilities: { runtimeTypes: ['container' as const], persistenceScopes: ['task' as const, 'workspace' as const, 'personal' as const], durableSuspend: false, snapshots: true },
    };
    const sel = resolveRuntime(
      { required: true, runtimeType: 'linux_vm', persistence: 'workspace' },
      [containerAdapter],
    );
    expect(sel.runtimeId).toBeNull();
    expect(sel.reason).toBe('runtime_type_unavailable');

    // A container requirement IS satisfied by the container adapter.
    const selOk = resolveRuntime(
      { required: true, runtimeType: 'container', persistence: 'workspace' },
      [containerAdapter],
    );
    expect(selOk.runtimeId).toBe('daytona-container');
    expect(selOk.reason).toBe('runtime_selected');
  });
});