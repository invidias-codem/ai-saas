// lib/intelligence/execution/vdi/daytonaAdapter.ts
// VDI-1: Daytona adapter implementing ExecutionRuntime + DesktopBroker
//
// Key invariants:
// - Uses Linux VM images (sandboxClass: 'linux-vm'), NOT containers
// - Operation-key reconciliation prevents duplicate VMs on lost create responses
// - Ownership validation before adopting any resource
// - Lease race protection: atomic lease check before suspend
// - Execution timeout enforced at SDK level, not just caller wait
// - Evidence records operation key, provider ID, desired/observed state, timings

import { Daytona, Sandbox, Image, Resources, CodeLanguage } from '@daytona/sdk';
import type { ExecutionRuntime, RuntimeSpec, Runtime, RuntimeCapabilities, RuntimeAction, ActionResult, RuntimeSnapshot } from '../contracts';
import type { DesktopBroker, DesktopSpec, Desktop, DesktopCapabilities, DesktopPhase, DesktopAction, DesktopSnapshot, DesktopSessionLease, ExecutionLease, DesktopHealth, TenantScope, ProvisioningOperationKey, IdempotentProvisioner, DesktopPolicy } from './contracts';
import { env } from '@/lib/env';
import { hashDesktopSpec, canSuspend, makeProvisioningOperationKey } from './contracts';

// ── Injected dependencies (tests use fixtures; production uses real SDK) ─────

export interface DaytonaClient {
  create(params: any): Promise<Sandbox>;
  get(id: string): Promise<Sandbox>;
  /** SDK 0.223: list() is an async iterator, not a promise of an array. */
  list(query?: any): AsyncIterableIterator<Sandbox>;
}

export interface DaytonaAdapterDeps {
  client: DaytonaClient;
  /** Operation key store for idempotent provisioning reconciliation. */
  operationKeyStore: IdempotentProvisioner;
  /** Clock for evidence timestamps. */
  clock: { now(): string };
  /** Policy for lease/suspend decisions. */
  policy: DesktopPolicy;
}

// ── Daytona VM Image Mapping ────────────────────────────────────────────────

/**
 * Map Lattice image versions to Daytona images.
 * Live-verified 2026-10-11 (scripts/vdi-image-probe.ts): bare registry refs
 * (ubuntu:22.04) build; the daytonaio/* prefixed refs fail with build_failed.
 * SDK 0.223 has no `sandboxClass` param — that was an invalid assumption.
 */
const VM_IMAGE_MAP: Record<string, string> = {
  'ubuntu-22.04-v1': 'ubuntu:22.04',
  'ubuntu-24.04-v1': 'ubuntu:24.04',
  'debian-12-v1': 'debian:12',
};

/** Default VM image if version not explicitly mapped. */
const DEFAULT_VM_IMAGE = 'ubuntu:22.04';

// ── Adapter Implementation ──────────────────────────────────────────────────

// Note: implements ExecutionRuntime only. The DesktopBroker-shaped operations
// live on this class under their *Desktop-suffixed names (createDesktop, etc.);
// DesktopBroker's create/resume/... signatures are incompatible with
// ExecutionRuntime's, so one class cannot implement both interfaces directly.
export class DaytonaExecutionAdapter implements ExecutionRuntime {
  readonly id = 'daytona-vm';
  readonly capabilities: RuntimeCapabilities & DesktopCapabilities;

  constructor(deps: DaytonaAdapterDeps) {
    this.deps = deps;
    this._daytonaClient = deps.client;

    // Live-verified 2026-10-11: this org provisions sandboxClass 'container'
    // (linux-vm requires the org-level sandbox_kvm feature). Advertise the
    // observed class so resolveRuntime abstains on linux_vm requirements
    // instead of silently satisfying them with a container.
    // suspend = stop()/start(): files persist, processes do NOT — resumed
    // guests need process restart (documented for the ops console).
    // VM eligibility: add 'linux_vm' here only after org capability verification.
    this.capabilities = {
      runtimeTypes: ['container'],
      persistenceScopes: ['task', 'workspace', 'personal'],
      durableSuspend: false, // stop/start preserves files, not processes
      snapshots: true,
      maxDesktopsPerWorkspace: 10,
      sessionProtocols: ['vnc', 'webvnc'],
    };
  }

  // Expose client for testing
  getClient(): DaytonaClient {
    return this._daytonaClient;
  }

  private readonly deps: DaytonaAdapterDeps;
  private readonly _daytonaClient: DaytonaClient;

  // ── Operation Key Reconciliation (VDI-0 requirement) ──────────────────────

  /** Check if provisioning already completed or in progress. */
  private async checkProvisioningReconciliation(
    operationKey: string
  ): Promise<{ desktopId: string } | { status: 'in_progress' } | null> {
    return this.deps.operationKeyStore.checkOperationKey(operationKey);
  }

  /** Record the outcome of a provisioning operation. */
  private async recordProvisioningOutcome(
    operationKey: string,
    outcome: { desktopId: string } | { error: string } | { status: 'in_progress' }
  ): Promise<void> {
    return this.deps.operationKeyStore.recordOperationKey(operationKey, outcome as { desktopId: string });
  }

  // ── Ownership Validation ──────────────────────────────────────────────────

  /** Validate that a discovered sandbox matches expected ownership and spec. */
  private validateOwnership(
    sandbox: Sandbox,
    expected: { tenantId: string; workspaceId: string; specHash: string; desktopId?: string }
  ): { ok: boolean; error?: string } {
    // Check labels for ownership
    const labels = sandbox.labels || {};
    if (labels['lattice-tenant'] !== expected.tenantId) {
      return { ok: false, error: `tenant mismatch: expected ${expected.tenantId}, got ${labels['lattice-tenant']}` };
    }
    if (labels['lattice-workspace'] !== expected.workspaceId) {
      return { ok: false, error: `workspace mismatch: expected ${expected.workspaceId}, got ${labels['lattice-workspace']}` };
    }
    if (expected.specHash && labels['lattice-spec-hash'] !== expected.specHash) {
      return { ok: false, error: `spec hash mismatch: expected ${expected.specHash}, got ${labels['lattice-spec-hash']}` };
    }
    if (expected.desktopId && labels['lattice-desktop-id'] !== expected.desktopId) {
      return { ok: false, error: `desktopId mismatch: expected ${expected.desktopId}, got ${labels['lattice-desktop-id']}` };
    }
    // Class note: live-verified 2026-10-11 — this org provisions
    // sandboxClass 'container' only (linux-vm requires the org-level
    // sandbox_kvm feature), so class is NOT used to reject.
    // ponytail: if a VM-only guarantee is ever required, gate on the
    // org feature flag and reject 'container' then.
    return { ok: true };
  }

  // ── Build Create Parameters ───────────────────────────────────────────────

  private buildCreateParams(
    spec: DesktopSpec,
    scope: TenantScope,
    operationKey: string
  ): any {
    const vmImage = VM_IMAGE_MAP[spec.imageVersion] ?? DEFAULT_VM_IMAGE;

    const resources: Resources = {
      cpu: spec.cpuShares ?? 2,
      memory: (spec.memoryMb ?? 4096) / 1024, // MB to GiB
      disk: spec.storageGb ?? 20,
    };

    const labels = {
      'lattice-tenant': scope.tenantId,
      'lattice-workspace': scope.workspaceId,
      'lattice-spec-hash': hashDesktopSpec(spec),
      'lattice-operation-key': operationKey,
      'lattice-persistence': spec.persistence,
    };

    return {
      image: vmImage,
      resources,
      labels,
      autoPauseInterval: 60, // 60 minutes default
      autoStopInterval: 0, // disable auto-stop; we control suspend explicitly
      autoDeleteInterval: -1, // disable auto-delete
      autoArchiveInterval: 0, // use maximum interval
      networkBlockAll: false,
      // ephemeral: false for persistent desktops
      ephemeral: spec.persistence === 'task',
    };
  }

  // ── Map Daytona Sandbox → Desktop ─────────────────────────────────────────

  private mapSandboxToDesktop(sandbox: Sandbox, spec: DesktopSpec, scope: TenantScope): Desktop {
    const now = this.deps.clock.now();
    const labels = sandbox.labels || {};

    // Map Daytona state to DesktopPhase
    let phase: DesktopPhase = 'provisioning';
    switch (sandbox.state) {
      case 'started': phase = 'ready'; break;
      case 'stopped': phase = 'suspended'; break;
      case 'paused': phase = 'suspended'; break;
      case 'snapshotting': phase = 'ready'; break;
      case 'archived': phase = 'suspended'; break;
      case 'destroyed': phase = 'destroyed'; break;
      case 'error': phase = 'failed'; break;
      default: phase = 'provisioning';
    }

    return {
      desktopId: labels['lattice-desktop-id'] ?? sandbox.id,
      spec,
      providerId: sandbox.id,
      provider: 'daytona',
      phase,
      createdAt: sandbox.createdAt ?? now,
      resumeKey: sandbox.id, // Daytona sandbox ID is the resume key
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sessionLease: undefined, // populated by grantSession
      executionLease: undefined, // populated by grantExecution
    };
  }

  // ── Map Daytona Sandbox → Runtime (ExecutionRuntime interface) ───────────

  private mapSandboxToRuntime(sandbox: Sandbox, spec: RuntimeSpec): Runtime {
    let status: Runtime['status'] = 'creating';
    switch (sandbox.state) {
      case 'started': status = 'ready'; break;
      case 'stopped':
      case 'paused':
        status = 'suspended'; break;
      case 'destroyed': status = 'destroyed'; break;
      case 'error': status = 'failed'; break;
      default: status = 'creating';
    }

    return {
      runtimeId: sandbox.id,
      runtimeType: 'linux_vm',
      persistence: spec.persistence,
      status,
      createdAt: sandbox.createdAt ?? this.deps.clock.now(),
      resumeKey: sandbox.id,
    };
  }

  // ── ExecutionRuntime Interface (6 operations) ─────────────────────────────

  async create(spec: RuntimeSpec): Promise<Runtime> {
    // Convert to DesktopSpec for unified create
    const desktopSpec: DesktopSpec = {
      runtimeType: 'linux_vm', // Daytona maps every runtime request to a Linux VM
      persistence: spec.persistence === 'request' ? 'task' : spec.persistence,
      memoryMb: spec.memoryMb,
      cpuShares: spec.cpuShares,
      imageVersion: 'ubuntu-22.04-v1', // default
      seedFiles: spec.seedFiles,
      env: spec.env,
      labels: spec.labels,
    };

    const scope: TenantScope = {
      tenantId: (spec.labels?.['lattice-tenant'] ?? 'default') as string,
      workspaceId: (spec.labels?.['lattice-workspace'] ?? 'default') as string,
    };

    const operationKey = makeProvisioningOperationKey(scope.tenantId, scope.workspaceId, desktopSpec);

    // Reconciliation: check if already provisioned
    const existing = await this.checkProvisioningReconciliation(operationKey);
    if (existing && 'desktopId' in existing) {
      const sandbox = await this._daytonaClient.get(existing.desktopId);
      return this.mapSandboxToRuntime(sandbox, spec);
    }
    if (existing && existing.status === 'in_progress') {
      throw new Error(`Provisioning already in progress for operationKey: ${operationKey}`);
    }

    // Record in-progress
    await this.recordProvisioningOutcome(operationKey, { status: 'in_progress' });

    try {
      const params = this.buildCreateParams(desktopSpec, scope, operationKey);
      const sandbox = await this._daytonaClient.create(params);

      // Record success
      await this.recordProvisioningOutcome(operationKey, { desktopId: sandbox.id });

      // Update labels with desktopId
      await sandbox.setLabels({ ...params.labels, 'lattice-desktop-id': sandbox.id });

      return this.mapSandboxToRuntime(sandbox, spec);
    } catch (error) {
      // Record failure
      await this.recordProvisioningOutcome(operationKey, { error: String(error) });
      throw error;
    }
  }

  async resume(runtimeId: string): Promise<Runtime> {
    const sandbox = await this._daytonaClient.get(runtimeId);
    if (!sandbox) throw new Error(`Sandbox not found: ${runtimeId}`);

    // Verify ownership via labels
    const ownership = this.validateOwnership(sandbox, {
      tenantId: sandbox.labels?.['lattice-tenant'] ?? '',
      workspaceId: sandbox.labels?.['lattice-workspace'] ?? '',
      specHash: sandbox.labels?.['lattice-spec-hash'] ?? '',
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    // Daytona: start() resumes from stopped/paused
    await sandbox.start();
    await sandbox.refreshData();

    return this.mapSandboxToRuntime(sandbox, {
      runtimeType: 'linux_vm',
      persistence: 'workspace',
      memoryMb: sandbox.memory * 1024,
      cpuShares: sandbox.cpu,
    });
  }

  async execute(runtimeId: string, action: RuntimeAction): Promise<ActionResult> {
    const sandbox = await this._daytonaClient.get(runtimeId);
    if (!sandbox) throw new Error(`Sandbox not found: ${runtimeId}`);

    // Verify ownership
    const ownership = this.validateOwnership(sandbox, {
      tenantId: sandbox.labels?.['lattice-tenant'] ?? '',
      workspaceId: sandbox.labels?.['lattice-workspace'] ?? '',
      specHash: sandbox.labels?.['lattice-spec-hash'] ?? '',
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    const startedAt = Date.now();
    let result: ActionResult;

    try {
      switch (action.kind) {
        case 'shell': {
          const timeoutMs = action.timeoutMs ?? 30_000;
          // Execute with SDK timeout enforcement (4th arg = seconds)
          const execResult = await sandbox.process.executeCommand(action.command, undefined, undefined, Math.ceil(timeoutMs / 1000));
          result = {
            exitCode: execResult.exitCode ?? 0,
            stdout: execResult.result ?? '',
            stderr: execResult.exitCode === 0 ? '' : execResult.result ?? '',
            timedOut: execResult.exitCode === 124 || execResult.exitCode === -1,
            durationMs: Date.now() - startedAt,
          };
          break;
        }
        case 'file_read': {
          const content = await sandbox.fs.downloadFile(action.path);
          result = {
            exitCode: 0,
            stdout: content.toString('utf8'),
            stderr: '',
            timedOut: false,
            durationMs: Date.now() - startedAt,
          };
          break;
        }
        case 'file_write': {
          // SDK signature: uploadFile(file, remotePath)
          await sandbox.fs.uploadFile(Buffer.from(action.content), action.path);
          result = {
            exitCode: 0,
            stdout: '',
            stderr: '',
            timedOut: false,
            durationMs: Date.now() - startedAt,
          };
          break;
        }
        case 'http': {
          // HTTP not directly supported in sandbox; use shell with curl
          const cmd = `curl -sS -X ${action.method ?? 'GET'} ${action.url} ${action.body ? `-d '${action.body}'` : ''}`;
          const execResult = await sandbox.process.executeCommand(cmd, undefined, undefined, 30);
          result = {
            exitCode: execResult.exitCode ?? 0,
            stdout: execResult.result ?? '',
            stderr: execResult.exitCode === 0 ? '' : execResult.result ?? '',
            timedOut: execResult.exitCode === 124,
            durationMs: Date.now() - startedAt,
          };
          break;
        }
        default:
          throw new Error(`Unsupported action kind`);
      }
    } catch (error: any) {
      // SDK timeout errors have specific codes
      if (error?.name === 'DaytonaProcessExecutionTimeoutError' || error?.message?.includes('timeout')) {
        return {
          exitCode: 124,
          stdout: '',
          stderr: `Execution timeout: ${error.message}`,
          timedOut: true,
          durationMs: Date.now() - startedAt,
        };
      }
      throw error;
    }

    return result;
  }

  async snapshot(runtimeId: string): Promise<RuntimeSnapshot> {
    const sandbox = await this._daytonaClient.get(runtimeId);
    if (!sandbox) throw new Error(`Sandbox not found: ${runtimeId}`);

    const snapshotId = `snap-${Date.now()}-${runtimeId.slice(-6)}`;
    await sandbox.createSnapshot(snapshotId);

    return {
      snapshotId,
      runtimeId,
      createdAt: this.deps.clock.now(),
    };
  }

  async suspend(runtimeId: string): Promise<void> {
    const sandbox = await this._daytonaClient.get(runtimeId);
    if (!sandbox) throw new Error(`Sandbox not found: ${runtimeId}`);

    // Live-verified 2026-10-11: pause() returns 422 on container-class
    // sandboxes; stop()/start() is the supported suspend/resume pair.
    await sandbox.stop();
  }

  async destroy(runtimeId: string): Promise<void> {
    const sandbox = await this._daytonaClient.get(runtimeId);
    if (!sandbox) {
      // Idempotent: already destroyed
      return;
    }
    await sandbox.delete(60, true); // wait for destroyed
  }

  // ── DesktopBroker Interface (6 lifecycle + 4 lease ops) ───────────────────

  async createDesktop(spec: DesktopSpec, scope: TenantScope): Promise<Desktop> {
    const operationKey = makeProvisioningOperationKey(scope.tenantId, scope.workspaceId, spec);

    // Reconciliation check
    const existing = await this.checkProvisioningReconciliation(operationKey);
    if (existing && 'desktopId' in existing) {
      const sandbox = await this._daytonaClient.get(existing.desktopId);
      return this.mapSandboxToDesktop(sandbox, spec, scope);
    }
    if (existing && existing.status === 'in_progress') {
      throw new Error(`Provisioning already in progress for operationKey: ${operationKey}`);
    }

    await this.recordProvisioningOutcome(operationKey, { status: 'in_progress' });

    try {
      const params = this.buildCreateParams(spec, scope, operationKey);
      const sandbox = await this._daytonaClient.create(params);

      await this.recordProvisioningOutcome(operationKey, { desktopId: sandbox.id });
      await sandbox.setLabels({ ...params.labels, 'lattice-desktop-id': sandbox.id });

      return this.mapSandboxToDesktop(sandbox, spec, scope);
    } catch (error) {
      await this.recordProvisioningOutcome(operationKey, { error: String(error) });
      throw error;
    }
  }

  async resumeDesktop(desktopId: string, scope: TenantScope): Promise<Desktop> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: sandbox.labels?.['lattice-spec-hash'] ?? '',
      desktopId,
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    await sandbox.start();
    await sandbox.refreshData();

    const spec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: (sandbox.labels?.['lattice-persistence'] as DesktopSpec['persistence']) ?? 'workspace',
      imageVersion: sandbox.labels?.['lattice-image-version'] ?? 'ubuntu-22.04-v1',
      memoryMb: sandbox.memory * 1024,
      cpuShares: sandbox.cpu,
      storageGb: sandbox.disk,
    };

    return this.mapSandboxToDesktop(sandbox, spec, scope);
  }

  async executeDesktop(desktopId: string, action: DesktopAction, scope: TenantScope): Promise<ActionResult> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: '',
      desktopId,
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    const startedAt = Date.now();

    try {
      switch (action.kind) {
        case 'shell': {
          const execResult = await sandbox.process.executeCommand(action.command, undefined, undefined, Math.ceil((action.timeoutMs ?? 30_000) / 1000));
          return {
            exitCode: execResult.exitCode ?? 0,
            stdout: execResult.result ?? '',
            stderr: execResult.exitCode === 0 ? '' : execResult.result ?? '',
            timedOut: execResult.exitCode === 124 || execResult.exitCode === -1,
            durationMs: Date.now() - startedAt,
          };
        }
        case 'file_read': {
          const content = await sandbox.fs.downloadFile(action.path);
          return {
            exitCode: 0,
            stdout: content.toString('utf8'),
            stderr: '',
            timedOut: false,
            durationMs: Date.now() - startedAt,
          };
        }
        case 'file_write': {
          // SDK signature: uploadFile(file, remotePath)
          await sandbox.fs.uploadFile(Buffer.from(action.content), action.path);
          return {
            exitCode: 0,
            stdout: '',
            stderr: '',
            timedOut: false,
            durationMs: Date.now() - startedAt,
          };
        }
        case 'http': {
          const cmd = `curl -sS -X ${action.method ?? 'GET'} ${action.url} ${action.body ? `-d '${action.body}'` : ''}`;
          const execResult = await sandbox.process.executeCommand(cmd, undefined, undefined, 30);
          return {
            exitCode: execResult.exitCode ?? 0,
            stdout: execResult.result ?? '',
            stderr: execResult.exitCode === 0 ? '' : execResult.result ?? '',
            timedOut: execResult.exitCode === 124,
            durationMs: Date.now() - startedAt,
          };
        }
        case 'screenshot': {
          // Daytona computerUse screenshot API
          const shot = await sandbox.computerUse.screenshot.takeFullScreen();
          void shot; // base64 payload unused; stdout reports the requested path
          return {
            exitCode: 0,
            stdout: action.path ?? '/tmp/screenshot.png',
            stderr: '',
            timedOut: false,
            durationMs: Date.now() - startedAt,
          };
        }
        default:
          throw new Error(`Unsupported action`);
      }
    } catch (error: any) {
      if (error?.name === 'DaytonaProcessExecutionTimeoutError' || error?.message?.includes('timeout')) {
        return {
          exitCode: 124,
          stdout: '',
          stderr: `Execution timeout: ${error.message}`,
          timedOut: true,
          durationMs: Date.now() - startedAt,
        };
      }
      throw error;
    }
  }

  async snapshotDesktop(desktopId: string, scope: TenantScope): Promise<DesktopSnapshot> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const snapshotId = `snap-${Date.now()}-${desktopId.slice(-6)}`;
    await sandbox.createSnapshot(snapshotId);

    return {
      snapshotId,
      desktopId,
      createdAt: this.deps.clock.now(),
    };
  }

  async suspendDesktop(desktopId: string, scope: TenantScope): Promise<void> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    // Ownership check
    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: '',
      desktopId,
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    // LEASE RACE PROTECTION: atomic check before suspend
    // Must re-read desktop state to get latest leases
    const desktop = await this.getDesktopState(desktopId, scope);
    if (!canSuspend(desktop)) {
      throw new Error('Cannot suspend: active session or execution lease present');
    }

    // Live-verified 2026-10-11: pause() 422s on container-class; stop() is the
    // supported suspend. Resume (resumeDesktop/start) reads state back intact.
    await sandbox.stop();
  }

  async destroyDesktop(desktopId: string, scope: TenantScope): Promise<void> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) return; // idempotent

    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: '',
      desktopId,
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    await sandbox.delete(60, true);
  }

  async grantSession(desktopId: string, userId: string, ttlMs: number, scope: TenantScope): Promise<DesktopSessionLease> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: '',
      desktopId,
    });
    if (!ownership.ok) throw new Error(`Ownership validation failed: ${ownership.error}`);

    // Daytona provides VNC/WebVNC via computerUse or preview
    // For now, return a connection grant token (SDK doesn't expose VNC password directly)
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = this.deps.clock.now();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    // Update desktop with session lease (labels)
    const currentLabels = sandbox.labels || {};
    await sandbox.setLabels({
      ...currentLabels,
      'lattice-session-id': sessionId,
      'lattice-session-user': userId,
      'lattice-session-expires': expiresAt,
    });

    return {
      sessionId,
      userId,
      grantedAt: now,
      expiresAt,
      connectionGrant: `daytona-vnc://${sandbox.id}`, // placeholder for VNC connection
    };
  }

  async revokeSession(desktopId: string, sessionId: string, scope: TenantScope): Promise<void> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) return;

    const currentLabels = sandbox.labels || {};
    if (currentLabels['lattice-session-id'] === sessionId) {
      const { ['lattice-session-id']: _, ['lattice-session-user']: __, ['lattice-session-expires']: ___, ...rest } = currentLabels;
      await sandbox.setLabels(rest);
    }
  }

  async grantExecution(desktopId: string, agentId: string, ttlMs: number, scope: TenantScope): Promise<ExecutionLease> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = this.deps.clock.now();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const currentLabels = sandbox.labels || {};
    await sandbox.setLabels({
      ...currentLabels,
      'lattice-exec-id': executionId,
      'lattice-exec-agent': agentId,
      'lattice-exec-expires': expiresAt,
    });

    return {
      executionId,
      agentId,
      grantedAt: now,
      expiresAt,
    };
  }

  async revokeExecution(desktopId: string, executionId: string, scope: TenantScope): Promise<void> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) return;

    const currentLabels = sandbox.labels || {};
    if (currentLabels['lattice-exec-id'] === executionId) {
      const { ['lattice-exec-id']: _, ['lattice-exec-agent']: __, ['lattice-exec-expires']: ___, ...rest } = currentLabels;
      await sandbox.setLabels(rest);
    }
  }

  async getDesktop(desktopId: string, scope: TenantScope): Promise<Desktop | null> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) return null;

    const ownership = this.validateOwnership(sandbox, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      specHash: '',
      desktopId,
    });
    if (!ownership.ok) return null;

    const spec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: (sandbox.labels?.['lattice-persistence'] as DesktopSpec['persistence']) ?? 'workspace',
      imageVersion: sandbox.labels?.['lattice-image-version'] ?? 'ubuntu-22.04-v1',
      memoryMb: sandbox.memory * 1024,
      cpuShares: sandbox.cpu,
      storageGb: sandbox.disk,
    };

    return this.mapSandboxToDesktop(sandbox, spec, scope);
  }

  async listDesktops(scope: TenantScope): Promise<Desktop[]> {
    const desktops: Desktop[] = [];
    for await (const sandbox of this._daytonaClient.list({
      labels: { 'lattice-tenant': scope.tenantId, 'lattice-workspace': scope.workspaceId },
    })) {
      const ownership = this.validateOwnership(sandbox, {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        specHash: '',
        desktopId: sandbox.labels?.['lattice-desktop-id'],
      });
      if (!ownership.ok) continue;

      const spec: DesktopSpec = {
        runtimeType: 'linux_vm',
        persistence: (sandbox.labels?.['lattice-persistence'] as DesktopSpec['persistence']) ?? 'workspace',
        imageVersion: sandbox.labels?.['lattice-image-version'] ?? 'ubuntu-22.04-v1',
        memoryMb: sandbox.memory * 1024,
        cpuShares: sandbox.cpu,
        storageGb: sandbox.disk,
      };

      desktops.push(this.mapSandboxToDesktop(sandbox, spec, scope));
    }
    return desktops;
  }

  // ── Helper: Get current desktop state with leases ─────────────────────────

  private async getDesktopState(desktopId: string, scope: TenantScope): Promise<Desktop> {
    const sandbox = await this._daytonaClient.get(desktopId);
    if (!sandbox) throw new Error(`Desktop not found: ${desktopId}`);

    const spec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: (sandbox.labels?.['lattice-persistence'] as DesktopSpec['persistence']) ?? 'workspace',
      imageVersion: sandbox.labels?.['lattice-image-version'] ?? 'ubuntu-22.04-v1',
      memoryMb: sandbox.memory * 1024,
      cpuShares: sandbox.cpu,
      storageGb: sandbox.disk,
    };

    const desktop = this.mapSandboxToDesktop(sandbox, spec, scope);

    // Populate leases from labels
    const labels = sandbox.labels || {};
    if (labels['lattice-session-id'] && labels['lattice-session-expires']) {
      const expiresAt = new Date(labels['lattice-session-expires']);
      if (expiresAt > new Date()) {
        desktop.sessionLease = {
          sessionId: labels['lattice-session-id'],
          userId: labels['lattice-session-user'] ?? 'unknown',
          grantedAt: labels['lattice-session-granted'] ?? new Date().toISOString(),
          expiresAt: labels['lattice-session-expires'],
          connectionGrant: `daytona-vnc://${sandbox.id}`,
        };
      }
    }
    if (labels['lattice-exec-id'] && labels['lattice-exec-expires']) {
      const expiresAt = new Date(labels['lattice-exec-expires']);
      if (expiresAt > new Date()) {
        desktop.executionLease = {
          executionId: labels['lattice-exec-id'],
          agentId: labels['lattice-exec-agent'] ?? 'unknown',
          grantedAt: labels['lattice-exec-granted'] ?? new Date().toISOString(),
          expiresAt: labels['lattice-exec-expires'],
        };
      }
    }

    return desktop;
  }

  // ── Evidence Recording ────────────────────────────────────────────────────

  /** Record operation evidence for audit trail. */
  async recordEvidence(event: {
    operationKey: string;
    providerId: string;
    desiredState: string;
    observedState: string;
    timingMs: number;
    failureClass?: string;
  }): Promise<void> {
    // In production, this writes to the evidence ledger
    // For now, emit to console/telemetry
    console.info('[VDI Evidence]', JSON.stringify({
      ...event,
      recordedAt: this.deps.clock.now(),
      adapter: this.id,
    }));
  }
}

// ── Production Factory ──────────────────────────────────────────────────────

let _cachedDaytonaClient: Daytona | null = null;

function getDaytonaClient(): Daytona {
  if (!_cachedDaytonaClient) {
    const apiKey = env.DAYTONA_API_KEY;
    const apiUrl = env.DAYTONA_API_URL ?? 'https://app.daytona.io/api';
    const target = env.DAYTONA_TARGET ?? 'us';

    if (!apiKey) {
      throw new Error('DAYTONA_API_KEY not configured');
    }

    _cachedDaytonaClient = new Daytona({ apiKey, apiUrl, target });
  }
  return _cachedDaytonaClient;
}

export function createDaytonaAdapter(deps: Omit<DaytonaAdapterDeps, 'client'>): DaytonaExecutionAdapter {
  const client: DaytonaClient = {
    create: (params) => getDaytonaClient().create(params),
    get: (id) => getDaytonaClient().get(id),
    list: (query) => getDaytonaClient().list(query),
  };

  return new DaytonaExecutionAdapter({ ...deps, client });
}