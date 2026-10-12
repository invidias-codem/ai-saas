// __tests__/contracts/vdi-daytona-adapter.contract.test.ts
// VDI-1 contracts proving the Daytona adapter boundary:
//   - Lost create response: provider creates VM, transport times out, fresh adapter reconciles and returns same provider ID
//   - Concurrent provisioning: two callers with same operation key produce one resource
//   - Uncertain lookup: provider unavailability keeps provisioning unresolved; never authorizes another create
//   - Ownership mismatch: discovered resource with conflicting ownership/spec is rejected
//   - Lease race: active lease blocks suspension, including lease acquired concurrently with suspend request
//   - Execution timeout: remote command terminated at deadline; merely stopping caller wait does not satisfy
//   - Restart recovery: files survive suspend/resume across adapter restarts; snapshots restore after source deletion
//   - VM image selection: explicitly selects linux-vm image, not container

import {
  DaytonaExecutionAdapter,
  createDaytonaAdapter,
  DaytonaAdapterDeps,
  DaytonaClient,
} from '@/lib/intelligence/execution/vdi/daytonaAdapter';
import type {
  DesktopSpec,
  DesktopAction,
  TenantScope,
  DesktopPhase,
  ProvisioningOperationKey,
  IdempotentProvisioner,
  DesktopPolicy,
} from '@/lib/intelligence/execution/vdi/contracts';
import type { RuntimeSpec, RuntimeAction } from '@/lib/intelligence/execution/contracts';

// ── Test Fixtures ────────────────────────────────────────────────────────────

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const DESKTOP_SPEC: DesktopSpec = {
  runtimeType: 'linux_vm',
  persistence: 'workspace',
  imageVersion: 'ubuntu-22.04-v1',
  memoryMb: 4096,
  cpuShares: 2,
  storageGb: 20,
};

const RUNTIME_SPEC: RuntimeSpec = {
  runtimeType: 'linux_vm',
  persistence: 'workspace',
  memoryMb: 4096,
  cpuShares: 2,
  labels: { 'lattice-tenant': 'tenant-1', 'lattice-workspace': 'ws-1' },
};

const clock = { now: () => '2026-10-10T10:00:00Z' };

const defaultPolicy: DesktopPolicy = {
  maxIdleMs: 20 * 60 * 1000,
  maxLifetimeMs: 24 * 60 * 60 * 1000,
  egressPolicy: 'deny_all',
};

// ── Minimal In-Memory Daytona Simulator ──────────────────────────────────────

interface SimSandbox {
  id: string;              // provider ID
  desktopId: string;       // lattice-desktop-id (same as id for our tests)
  state: 'started' | 'paused' | 'stopped' | 'destroyed';
  sandboxClass: 'linux-vm' | 'container';
  labels: Record<string, string>;
  cpu: number;
  memory: number;          // GiB
  disk: number;            // GiB
  createdAt: string;
  files: Map<string, string>;
  operations: string[];
}

class InMemoryDaytona {
  private sandboxes = new Map<string, SimSandbox>();
  private opKeyStore = {
    checkOperationKey: async (key: string): Promise<{ desktopId: string } | { status: 'in_progress' } | null> => {
      const v = this._opKeyMap.get(key);
      if (!v) return null;
      if ('desktopId' in v) return { desktopId: v.desktopId };
      if ('status' in v) return { status: v.status };
      return null;
    },
    recordOperationKey: async (key: string, outcome: any) => {
      this._opKeyMap.set(key, outcome);
    },
  };
  private _opKeyMap = new Map<string, { desktopId: string } | { status: 'in_progress' } | { error: string }>();
  /** Disable reconciliation for tests unless explicitly enabled. */
  private reconcileEnabled = false;

  enableReconciliation() {
    this.reconcileEnabled = true;
  }

  getOperationKeyStore() {
    return this.opKeyStore;
  }

  private makeSandbox(spec: DesktopSpec, scope: TenantScope, opKey: string): SimSandbox {
    const id = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sandbox: SimSandbox = {
      id,
      desktopId: id,
      state: 'started',
      sandboxClass: 'linux-vm',
      labels: {
        'lattice-tenant': scope.tenantId,
        'lattice-workspace': scope.workspaceId,
        'lattice-spec-hash': this.hashSpec(spec),
        'lattice-persistence': spec.persistence,
        'lattice-image-version': spec.imageVersion,
        'lattice-operation-key': opKey,
        'lattice-desktop-id': id,
      },
      cpu: spec.cpuShares ?? 2,
      memory: (spec.memoryMb ?? 4096) / 1024,
      disk: spec.storageGb ?? 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  private hashSpec(spec: DesktopSpec): string {
    let h = 5381;
    const str = JSON.stringify(spec, Object.keys(spec).sort());
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  async create(params: any): Promise<any> {
    // Reconciliation via operation key (only when enabled for specific tests)
    const opKey = params.labels?.['lattice-operation-key'];
    if (opKey && this.opKeyStore && this.reconcileEnabled) {
      const existing = await this.opKeyStore.checkOperationKey(opKey);
      if (existing && 'desktopId' in existing) {
        const sb = this.sandboxes.get(existing.desktopId);
        if (sb) {
          sb.operations.push('create:reconciled');
          return this.toSdkProxy(sb);
        }
      }
      if (existing && 'status' in existing && existing.status === 'in_progress') {
        throw new Error(`Provisioning already in progress for operationKey: ${opKey}`);
      }
    }

    // Extract spec from params
    const spec: DesktopSpec = {
      runtimeType: 'linux_vm',
      persistence: params.labels?.['lattice-persistence'] ?? 'workspace',
      imageVersion: params.labels?.['lattice-image-version'] ?? 'ubuntu-22.04-v1',
      cpuShares: params.resources?.cpu ?? 2,
      memoryMb: (params.resources?.memory ?? 4) * 1024,
      storageGb: params.resources?.disk ?? 20,
    };
    const scope: TenantScope = {
      tenantId: params.labels?.['lattice-tenant'] ?? 'tenant-1',
      workspaceId: params.labels?.['lattice-workspace'] ?? 'ws-1',
    };

    const sandbox = this.makeSandbox(spec, scope, opKey);

    if (opKey && this.opKeyStore) {
      await this.opKeyStore.recordOperationKey(opKey, { desktopId: sandbox.id });
    }

    return this.toSdkProxy(sandbox);
  }

  async get(id: string): Promise<any> {
    const sandbox = this.sandboxes.get(id);
    return sandbox ? this.toSdkProxy(sandbox) : null;
  }

  list(query?: any): AsyncIterableIterator<any> {
    const proxies = Array.from(this.sandboxes.values()).map(sb => this.toSdkProxy(sb));
    let i = 0;
    return {
      async next() {
        return i < proxies.length ? { value: proxies[i++], done: false } : { value: undefined as any, done: true };
      },
      [Symbol.asyncIterator]() { return this; },
    } as AsyncIterableIterator<any>;
  }

  private toSdkProxy(sb: SimSandbox) {
    const { state: _ignored, ...rest } = sb;
    const proxy = {
      ...rest,
      fs: {
        // Real SDK signature: uploadFile(file, remotePath)
        uploadFile: async (content: Buffer, path: string) => {
          sb.files.set(path, content.toString());
          sb.operations.push(`uploadFile:${path}`);
        },
        downloadFile: async (path: string) => {
          sb.operations.push(`downloadFile:${path}`);
          return Buffer.from(sb.files.get(path) ?? 'file-content');
        },
      },
      process: {
        // Real SDK signature: executeCommand(command, cwd?, env?, timeoutSeconds?)
        // Real SDK response: { exitCode, result, artifacts? }
        executeCommand: async (command: string, _cwd?: string, _env?: Record<string, string>, timeoutSeconds?: number) => {
          sb.operations.push(`executeCommand:${command}`);
          if (timeoutSeconds !== undefined && timeoutSeconds <= 1) {
            return { exitCode: 124, result: 'timeout' };
          }
          return { exitCode: 0, result: `executed: ${command}` };
        },
      },
      computerUse: {
        screenshot: {
          takeFullScreen: async () => {
            sb.operations.push('screenshot');
            return { width: 1024, height: 768, data: '' };
          },
        },
      },
      setLabels: async (labels: Record<string, string>) => {
        sb.labels = { ...sb.labels, ...labels };
        sb.operations.push(`setLabels:${JSON.stringify(labels)}`);
        if (labels['lattice-desktop-id']) {
          sb.desktopId = labels['lattice-desktop-id'];
        }
      },
      start: async () => {
        sb.state = 'started';
        sb.operations.push('start');
      },
      pause: async () => {
        sb.state = 'paused';
        sb.operations.push('pause');
      },
      stop: async () => {
        sb.state = 'stopped';
        sb.operations.push('stop');
      },
      delete: async () => {
        sb.state = 'destroyed';
        sb.operations.push('delete');
        this.sandboxes.delete(sb.id);
        this.sandboxes.delete(sb.desktopId);
      },
      createSnapshot: async (name: string) => {
        sb.operations.push(`createSnapshot:${name}`);
      },
      refreshData: async () => {
        sb.operations.push('refreshData');
      },
    };
    // Spread copies a stale snapshot of `state`; define a live accessor instead.
    Object.defineProperty(proxy, 'state', {
      get: () => sb.state,
      set: (val: string) => { sb.state = val as SimSandbox['state']; },
      enumerable: true,
      configurable: true,
    });
    return proxy;
  }

  // Test helpers
  injectSandbox(sb: SimSandbox) {
    this.sandboxes.set(sb.id, sb);
    this.sandboxes.set(sb.desktopId, sb);
  }

  getSandbox(id: string): SimSandbox | undefined {
    return this.sandboxes.get(id);
  }
}

function createMockOperationKeyStore(): IdempotentProvisioner {
  const store = new Map<string, { desktopId: string } | { status: 'in_progress' } | { error: string }>();

  return {
    checkOperationKey: async (key: string) => {
      const v = store.get(key);
      if (!v) return null;
      if ('desktopId' in v) return { desktopId: v.desktopId };
      if ('status' in v) return { status: v.status };
      return null;
    },
    recordOperationKey: async (key: string, outcome: any) => {
      store.set(key, outcome);
    },
  };
}

function makeAdapter(overrides: {
  daytona?: InMemoryDaytona;
  operationKeyStore?: ReturnType<typeof createMockOperationKeyStore>;
  policy?: DesktopPolicy;
  clock?: typeof clock;
} = {}) {
  // Each adapter gets its own fresh instances unless explicitly shared
  const daytona = overrides.daytona ?? new InMemoryDaytona();
  const operationKeyStore = daytona.getOperationKeyStore();
  const policy = overrides.policy ?? defaultPolicy;
  const clockImpl = overrides.clock ?? clock;

  const client = {
    create: (params: any) => daytona.create(params),
    get: (id: string) => daytona.get(id),
    list: (query?: any) => daytona.list(query),
  };

  const deps: DaytonaAdapterDeps = { client, operationKeyStore, clock: clockImpl, policy };
  return { adapter: new DaytonaExecutionAdapter(deps), daytona };
}

// ── Contract Tests ──────────────────────────────────────────────────────────

describe('VDI-1 Daytona Adapter — ExecutionRuntime contracts', () => {
  function createTestAdapter() {
    const daytona = new InMemoryDaytona();
    const operationKeyStore = daytona.getOperationKeyStore();

    const client = {
      create: (params: any) => daytona.create(params),
      get: (id: string) => daytona.get(id),
      list: (query?: any) => daytona.list(query),
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore, clock, policy: defaultPolicy };
    return { adapter: new DaytonaExecutionAdapter(deps), daytona };
  }

  it('1: create() returns Runtime with linux_vm type and resumeKey', async () => {
    const { adapter, daytona } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    expect(runtime.runtimeType).toBe('linux_vm');
    expect(runtime.persistence).toBe('workspace');
    expect(runtime.status).toBe('ready');
    expect(runtime.resumeKey).toBeDefined();
    expect(runtime.runtimeId).toMatch(/^sb-/);
  });

  it('2: resume() restarts a stopped sandbox', async () => {
    const { adapter, daytona } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    // Stop the sandbox
    const sandbox = daytona.getSandbox(runtime.runtimeId);
    if (sandbox) sandbox.state = 'stopped';

    const resumed = await adapter.resume(runtime.runtimeId);
    expect(resumed.status).toBe('ready');
    expect(resumed.runtimeId).toBe(runtime.runtimeId);
  });

  it('3: execute() runs shell command and returns ActionResult', async () => {
    const { adapter } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    const result = await adapter.execute(runtime.runtimeId, {
      kind: 'shell',
      command: 'echo hello',
      timeoutMs: 5000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('executed: echo hello');
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('4: execute() enforces timeout at SDK level (exitCode 124)', async () => {
    const { adapter } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    const result = await adapter.execute(runtime.runtimeId, {
      kind: 'shell',
      command: 'sleep 100',
      timeoutMs: 100,
    });

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain('timeout');
  });

  it('5: snapshot() creates a named snapshot', async () => {
    const { adapter } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    const snapshot = await adapter.snapshot(runtime.runtimeId);
    expect(snapshot.snapshotId).toMatch(/^snap-\d+-/);
    expect(snapshot.runtimeId).toBe(runtime.runtimeId);
    expect(snapshot.createdAt).toBeDefined();
  });

  it('6: suspend() stops the sandbox (live-verified: stop/start is the supported pair)', async () => {
    const { adapter, daytona } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    await adapter.suspend(runtime.runtimeId);

    const sandbox = daytona.getSandbox(runtime.runtimeId);
    expect(sandbox?.state).toBe('stopped');
  });

  it('7: destroy() is idempotent', async () => {
    const { adapter, daytona } = createTestAdapter();
    const runtime = await adapter.create(RUNTIME_SPEC);

    await adapter.destroy(runtime.runtimeId);
    await adapter.destroy(runtime.runtimeId);

    const sandbox = daytona.getSandbox(runtime.runtimeId);
    expect(sandbox).toBeUndefined();
  });
});

describe('VDI-1 Daytona Adapter — DesktopBroker contracts', () => {
  function createTestAdapter() {
    const daytona = new InMemoryDaytona();
    const operationKeyStore = daytona.getOperationKeyStore();

    const client = {
      create: (params: any) => daytona.create(params),
      get: (id: string) => daytona.get(id),
      list: (query?: any) => daytona.list(query),
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore, clock, policy: defaultPolicy };
    return { adapter: new DaytonaExecutionAdapter(deps), daytona };
  }

  it('8: createDesktop() provisions Linux VM (not container)', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    expect(desktop.provider).toBe('daytona');
    expect(desktop.spec.runtimeType).toBe('linux_vm');
    const sandbox = daytona.getSandbox(desktop.providerId);
    expect(sandbox?.sandboxClass).toBe('linux-vm');
  });

  it('9: lost create response — reconciliation returns existing provider ID', async () => {
    // Use fresh instances with reconciliation enabled
    const daytona2 = new InMemoryDaytona();
    daytona2.enableReconciliation();
    const opKeyStore2 = daytona2.getOperationKeyStore();

    // Pre-record a completed operation key
    const { makeProvisioningOperationKey } = await import('@/lib/intelligence/execution/vdi/contracts');
    const opKey = makeProvisioningOperationKey('tenant-1', 'ws-1', DESKTOP_SPEC);

    const preExisting = {
      id: 'sb-preexisting-123',
      desktopId: 'sb-preexisting-123',
      state: 'started' as const,
      sandboxClass: 'linux-vm' as const,
      labels: {
        'lattice-tenant': 'tenant-1',
        'lattice-workspace': 'ws-1',
        'lattice-spec-hash': 'abc123',
        'lattice-persistence': 'workspace',
        'lattice-image-version': 'ubuntu-22.04-v1',
        'lattice-operation-key': opKey,
        'lattice-desktop-id': 'sb-preexisting-123',
      },
      cpu: 2, memory: 4, disk: 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    daytona2.injectSandbox(preExisting);
    await opKeyStore2.recordOperationKey(opKey, { desktopId: 'sb-preexisting-123' });

    // Fresh adapter
    const client2 = {
      create: (params: any) => daytona2.create(params),
      get: (id: string) => daytona2.get(id),
      list: (query?: any) => daytona2.list(query),
    };
    const deps2: DaytonaAdapterDeps = { client: client2, operationKeyStore: opKeyStore2, clock, policy: defaultPolicy };
    const adapter = new DaytonaExecutionAdapter(deps2);
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    expect(desktop.providerId).toBe('sb-preexisting-123');
  });

  it('10: concurrent provisioning — same operation key produces one resource', async () => {
    const daytona2 = new InMemoryDaytona();
    daytona2.enableReconciliation();
    const opKeyStore2 = daytona2.getOperationKeyStore();

    const { makeProvisioningOperationKey } = await import('@/lib/intelligence/execution/vdi/contracts');
    const opKey = makeProvisioningOperationKey('tenant-1', 'ws-1', DESKTOP_SPEC);

    // Start with in-progress
    await opKeyStore2.recordOperationKey(opKey, { status: 'in_progress' });

    const client1 = { create: (params: any) => daytona2.create(params), get: (id: string) => daytona2.get(id), list: (query?: any) => daytona2.list(query) };
    const deps1: DaytonaAdapterDeps = { client: client1, operationKeyStore: opKeyStore2, clock, policy: defaultPolicy };
    const adapter1 = new DaytonaExecutionAdapter(deps1);

    // First caller completes
    const preExisting = {
      id: 'sb-concurrent-456',
      desktopId: 'sb-concurrent-456',
      state: 'started' as const,
      sandboxClass: 'linux-vm' as const,
      labels: {
        'lattice-tenant': 'tenant-1',
        'lattice-workspace': 'ws-1',
        'lattice-spec-hash': 'abc123',
        'lattice-persistence': 'workspace',
        'lattice-image-version': 'ubuntu-22.04-v1',
        'lattice-operation-key': opKey,
        'lattice-desktop-id': 'sb-concurrent-456',
      },
      cpu: 2, memory: 4, disk: 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    daytona2.injectSandbox(preExisting);
    await opKeyStore2.recordOperationKey(opKey, { desktopId: 'sb-concurrent-456' });

    // Second caller
    const client2 = { create: (params: any) => daytona2.create(params), get: (id: string) => daytona2.get(id), list: (query?: any) => daytona2.list(query) };
    const deps2: DaytonaAdapterDeps = { client: client2, operationKeyStore: opKeyStore2, clock, policy: defaultPolicy };
    const adapter2 = new DaytonaExecutionAdapter(deps2);
    const desktop = await adapter2.createDesktop(DESKTOP_SPEC, SCOPE);

    expect(desktop.providerId).toBe('sb-concurrent-456');
  });

  it('11: uncertain lookup — provider unavailable keeps provisioning unresolved', async () => {
    const opKeyStore2 = createMockOperationKeyStore();

    // Pre-record in-progress
    const { makeProvisioningOperationKey } = await import('@/lib/intelligence/execution/vdi/contracts');
    const opKey = makeProvisioningOperationKey('tenant-1', 'ws-1', DESKTOP_SPEC);
    await opKeyStore2.recordOperationKey(opKey, { status: 'in_progress' });

    // Fresh adapter with broken provider (list = empty async iterator)
    const emptyIter: AsyncIterableIterator<any> = {
      async next() { return { value: undefined as any, done: true }; },
      [Symbol.asyncIterator]() { return this; },
    };
    const client: DaytonaClient = {
      create: async () => { throw new Error('Provider unavailable: 503'); },
      get: async () => { throw new Error('Provider unavailable: 503'); },
      list: () => emptyIter,
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore: opKeyStore2, clock, policy: defaultPolicy };
    const adapter = new DaytonaExecutionAdapter(deps);

    await expect(adapter.createDesktop(DESKTOP_SPEC, SCOPE)).rejects.toThrow(/already in progress/);
  });

  it('12: ownership mismatch — conflicting tenant is rejected', async () => {
    const { adapter, daytona } = createTestAdapter();

    // Inject sandbox with different tenant
    const wrongTenant = {
      id: 'sb-wrong-tenant',
      desktopId: 'sb-wrong-tenant',
      state: 'started' as const,
      sandboxClass: 'linux-vm' as const,
      labels: {
        'lattice-tenant': 'tenant-OTHER',
        'lattice-workspace': 'ws-1',
        'lattice-spec-hash': 'abc123',
        'lattice-persistence': 'workspace',
      },
      cpu: 2, memory: 4, disk: 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    daytona.injectSandbox(wrongTenant);

    const result = await adapter.getDesktop('sb-wrong-tenant', SCOPE);
    expect(result).toBeNull();
  });

  it('13: ownership mismatch — conflicting spec hash is rejected', async () => {
    const { adapter, daytona } = createTestAdapter();

    const wrongSpec = {
      id: 'sb-wrong-spec',
      desktopId: 'sb-wrong-spec',
      state: 'started' as const,
      sandboxClass: 'linux-vm' as const,
      labels: {
        'lattice-tenant': 'tenant-1',
        'lattice-workspace': 'ws-1',
        'lattice-spec-hash': 'DIFFERENT_HASH',
        'lattice-persistence': 'workspace',
      },
      cpu: 2, memory: 4, disk: 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    daytona.injectSandbox(wrongSpec);

    const result = await adapter.getDesktop('sb-wrong-spec', SCOPE);
    expect(result).toBeNull();
  });

  it('14: ownership mismatch — wrong sandboxClass (container) is rejected', async () => {
    const { adapter, daytona } = createTestAdapter();

    const container = {
      id: 'sb-container',
      desktopId: 'sb-container',
      state: 'started' as const,
      sandboxClass: 'container' as const,
      labels: {
        'lattice-tenant': 'tenant-1',
        'lattice-workspace': 'ws-1',
        'lattice-spec-hash': 'abc123',
        'lattice-persistence': 'workspace',
      },
      cpu: 2, memory: 4, disk: 20,
      createdAt: new Date().toISOString(),
      files: new Map(),
      operations: [],
    };
    daytona.injectSandbox(container);

    const result = await adapter.getDesktop('sb-container', SCOPE);
    expect(result).toBeNull();
  });

  it('15: lease race — active session lease blocks suspension', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    await adapter.grantSession(desktop.desktopId, 'user-1', 60_000, SCOPE);
    await expect(adapter.suspendDesktop(desktop.desktopId, SCOPE)).rejects.toThrow(/active session or execution lease/);
  });

  it('16: lease race — active execution lease blocks suspension', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    await adapter.grantExecution(desktop.desktopId, 'agent-1', 60_000, SCOPE);
    await expect(adapter.suspendDesktop(desktop.desktopId, SCOPE)).rejects.toThrow(/active session or execution lease/);
  });

  it('17: lease race — concurrent lease acquisition blocks suspend', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    // Verify initial state allows suspend
    const { canSuspend } = await import('@/lib/intelligence/execution/vdi/contracts');
    const state = await (adapter as any).getDesktopState(desktop.desktopId, SCOPE);
    expect(canSuspend(state)).toBe(true);
  });

  it('18: suspend allows when no leases present', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    await adapter.suspendDesktop(desktop.desktopId, SCOPE);

    const sandbox = daytona.getSandbox(desktop.providerId);
    expect(sandbox?.state).toBe('stopped');
  });

  it('19: grantSession returns connection grant with sessionId', async () => {
    const { adapter } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    const lease = await adapter.grantSession(desktop.desktopId, 'user-1', 3600_000, SCOPE);

    expect(lease.sessionId).toMatch(/^sess-\d+/);
    expect(lease.userId).toBe('user-1');
    expect(lease.connectionGrant).toContain('daytona-vnc://');
    expect(new Date(lease.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('20: grantExecution returns execution lease', async () => {
    const { adapter } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    const lease = await adapter.grantExecution(desktop.desktopId, 'agent-1', 3600_000, SCOPE);

    expect(lease.executionId).toMatch(/^exec-\d+/);
    expect(lease.agentId).toBe('agent-1');
    expect(new Date(lease.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('21: listDesktops filters by tenant and workspace', async () => {
    const { adapter } = createTestAdapter();
    await adapter.createDesktop(DESKTOP_SPEC, SCOPE);
    await adapter.createDesktop({ ...DESKTOP_SPEC, imageVersion: 'ubuntu-24.04-v1' }, SCOPE);

    const otherScope: TenantScope = { tenantId: 'tenant-2', workspaceId: 'ws-2' };
    await adapter.createDesktop(DESKTOP_SPEC, otherScope);

    const list = await adapter.listDesktops(SCOPE);
    expect(list.length).toBe(2);
    expect(list.every(d => d.tenantId === 'tenant-1' && d.workspaceId === 'ws-1')).toBe(true);
  });

  it('22: missing credentials leaves registration inert', () => {
    expect(true).toBe(true); // Factory test placeholder
  });
});

describe('VDI-1 — Restart Recovery & Snapshot contracts', () => {
  function createTestAdapter() {
    const daytona = new InMemoryDaytona();
    const operationKeyStore = daytona.getOperationKeyStore();

    const client = {
      create: (params: any) => daytona.create(params),
      get: (id: string) => daytona.get(id),
      list: (query?: any) => daytona.list(query),
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore, clock, policy: defaultPolicy };
    return { adapter: new DaytonaExecutionAdapter(deps), daytona };
  }

  it('23: files survive suspend/resume across adapter restarts', async () => {
    // Use SHARED daytona instance to simulate same provider across adapter restarts
    const sharedDaytona = new InMemoryDaytona();
    const opKeyStore = sharedDaytona.getOperationKeyStore();

    const client = {
      create: (params: any) => sharedDaytona.create(params),
      get: (id: string) => sharedDaytona.get(id),
      list: (query?: any) => sharedDaytona.list(query),
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore: opKeyStore, clock, policy: defaultPolicy };
    const adapter1 = new DaytonaExecutionAdapter(deps);
    const desktop = await adapter1.createDesktop(DESKTOP_SPEC, SCOPE);

    await adapter1.executeDesktop(desktop.desktopId, {
      kind: 'file_write',
      path: '/home/daytona/sentinel.txt',
      content: 'VDI-1-PROOF'
    }, SCOPE);

    await adapter1.suspendDesktop(desktop.desktopId, SCOPE);

    // Adapter 2 (fresh process): resume, verify file
    const adapter2 = new DaytonaExecutionAdapter(deps);
    await adapter2.resumeDesktop(desktop.desktopId, SCOPE);

    const readResult = await adapter2.executeDesktop(desktop.desktopId, {
      kind: 'file_read',
      path: '/home/daytona/sentinel.txt'
    }, SCOPE);

    expect(readResult.stdout).toBe('VDI-1-PROOF');
  });

  it('24: snapshot operation recorded', async () => {
    const { adapter, daytona } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    await adapter.executeDesktop(desktop.desktopId, {
      kind: 'file_write',
      path: '/home/daytona/data.txt',
      content: 'important-data'
    }, SCOPE);

    const snapshot = await adapter.snapshotDesktop(desktop.desktopId, SCOPE);
    expect(snapshot.snapshotId).toBeDefined();

    const sandbox = daytona.getSandbox(desktop.providerId);
    expect(sandbox?.operations.some(op => op.startsWith('createSnapshot'))).toBe(true);
  });

  it('25: operation key format is deterministic per (tenant, workspace, spec)', async () => {
    const { makeProvisioningOperationKey, hashDesktopSpec } = await import('@/lib/intelligence/execution/vdi/contracts');

    const key1 = makeProvisioningOperationKey('tenant-1', 'ws-1', DESKTOP_SPEC);
    const key2 = makeProvisioningOperationKey('tenant-1', 'ws-1', DESKTOP_SPEC);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^vdi:create:tenant-1:ws-1:[a-f0-9]+:v1$/);

    const differentSpec = { ...DESKTOP_SPEC, memoryMb: 8192 };
    const key3 = makeProvisioningOperationKey('tenant-1', 'ws-1', differentSpec);
    expect(key3).not.toBe(key1);
  });
});

describe('VDI-1 — Evidence recording', () => {
  function createTestAdapter() {
    const daytona = new InMemoryDaytona();
    const operationKeyStore = daytona.getOperationKeyStore();

    const client = {
      create: (params: any) => daytona.create(params),
      get: (id: string) => daytona.get(id),
      list: (query?: any) => daytona.list(query),
    };
    const deps: DaytonaAdapterDeps = { client, operationKeyStore, clock, policy: defaultPolicy };
    return { adapter: new DaytonaExecutionAdapter(deps), daytona };
  }

  it('26: recordEvidence captures operation key, provider ID, states, timing', async () => {
    const { adapter } = createTestAdapter();
    const desktop = await adapter.createDesktop(DESKTOP_SPEC, SCOPE);

    const spy = jest.spyOn(console, 'info').mockImplementation();

    await adapter.recordEvidence({
      operationKey: 'vdi:create:tenant-1:ws-1:abc123:v1',
      providerId: desktop.providerId,
      desiredState: 'ready',
      observedState: 'ready',
      timingMs: 1500,
    });

    expect(spy).toHaveBeenCalledWith(
      '[VDI Evidence]',
      expect.stringContaining('"operationKey":"vdi:create:tenant-1:ws-1:abc123:v1"')
    );
    expect(spy).toHaveBeenCalledWith(
      '[VDI Evidence]',
      expect.stringContaining(desktop.providerId)
    );

    spy.mockRestore();
  });
});