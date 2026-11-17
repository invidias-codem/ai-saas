// Account Compute Plane — A3.3: experimental Linux guest isolation adapter.
//
// NEVER wire this directly to an API route or enable it in production until
// a real qualified linux_vm has passed the isolation/lease test matrix.
// Executes argv only through a trusted, account-VM-bound command transport.
// No shell, raw provider credentials, host mounts, guest network, or secret env.

import { workspaceComputeNamespace } from '@/lib/intelligence/execution/accountCompute/contracts';
import type { GuestProvider, GuestPhase } from '@/lib/intelligence/execution/accountCompute/guest';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export interface QualifiedAccountVm {
  readonly ownerUserId: string;
  readonly desktopId: string;
  readonly runtimeType: 'linux_vm' | 'container';
  readonly state: string;
  /** A server-side provider qualification, never supplied by a client. */
  readonly providerQualified: boolean;
}

export interface GuestVmCommandTransport {
  /**
   * Execute argv WITHOUT a shell inside the account's verified Linux VM.
   * This transport MUST bind to accountVmDesktopId, enforce scope + timeout,
   * and never treat a container as a linux_vm.
   */
  execute(input: {
    readonly accountVmDesktopId: string;
    readonly scope: TenantScope;
    readonly argv: readonly string[];
    readonly timeoutMs: number;
  }): Promise<{ exitCode: number; stdout: string }>;
}

export interface RootlessPodmanGuestConfig {
  readonly imageDigest: string;
  readonly cpuLimit: number;
  readonly memoryMb: number;
  readonly workspaceTmpfsMb: number;
  readonly maxPids: number;
}

const IMAGE = /^[a-zA-Z0-9._/-]+@sha256:[a-f0-9]{64}$/;
const CID = /^[a-f0-9]{64}$/;
const NAMESPACE = /^ws-[a-f0-9]{32}$/;
const MAX_OUTPUT = 8192;
const TIMEOUT_MS = 30_000;

function assertRuntimeFlags(): void {
  if (
    process.env.ENABLE_ACCOUNT_COMPUTE !== 'true' ||
    process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE !== 'true' ||
    process.env.ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME !== 'true'
  ) throw new Error('Rootless guest runtime is disabled');
}

function ownerFromScope(scope: TenantScope): string {
  if (!scope.tenantId.startsWith('user:') || !scope.workspaceId.trim()) {
    throw new Error('Invalid account guest scope');
  }
  const owner = scope.tenantId.slice(5);
  if (!owner.trim()) throw new Error('Invalid account guest owner');
  return owner;
}

function safeConfig(config: RootlessPodmanGuestConfig): void {
  if (!IMAGE.test(config.imageDigest) ||
      !Number.isFinite(config.cpuLimit) || config.cpuLimit <= 0 || config.cpuLimit > 8 ||
      !Number.isSafeInteger(config.memoryMb) || config.memoryMb < 128 || config.memoryMb > 16384 ||
      !Number.isSafeInteger(config.workspaceTmpfsMb) || config.workspaceTmpfsMb < 16 ||
      config.workspaceTmpfsMb > config.memoryMb / 2 ||
      !Number.isSafeInteger(config.maxPids) || config.maxPids < 8 || config.maxPids > 512) {
    throw new Error('Invalid pinned image or guest resource limits');
  }
}

function guestName(namespace: string): string {
  if (!NAMESPACE.test(namespace)) throw new Error('Invalid workspace namespace');
  return 'lattice-' + namespace;
}

/**
 * A3.3 adapter is NOT a complete isolation guarantee. The host runner,
 * Podman rootless user namespaces, cgroups v2, seccomp, and real negative
 * cross-workspace tests must be independently qualified inside a Linux VM.
 */
export function createRootlessPodmanGuestProvider(
  lookupVm: (ownerUserId: string) => Promise<QualifiedAccountVm | null>,
  transport: GuestVmCommandTransport,
  config: RootlessPodmanGuestConfig,
): GuestProvider {
  safeConfig(config);

  async function vmFor(scope: TenantScope): Promise<QualifiedAccountVm> {
    assertRuntimeFlags();
    const owner = ownerFromScope(scope);
    const vm = await lookupVm(owner);
    if (!vm || vm.ownerUserId !== owner || !vm.desktopId ||
        vm.runtimeType !== 'linux_vm' || vm.state !== 'ready' ||
        vm.providerQualified !== true) {
      throw new Error('Qualified account Linux VM unavailable');
    }
    return vm;
  }

  async function command(
    vm: QualifiedAccountVm, scope: TenantScope, argv: readonly string[],
  ): Promise<string> {
    const result = await transport.execute({
      accountVmDesktopId: vm.desktopId,
      scope,
      argv,
      timeoutMs: TIMEOUT_MS,
    });
    if (!result || result.exitCode !== 0 ||
        typeof result.stdout !== 'string' || result.stdout.length > MAX_OUTPUT) {
      // Do not propagate remote stderr or provider URLs to API surfaces.
      throw new Error('Guest VM operation failed; reconciliation required');
    }
    return result.stdout.trim();
  }

  async function preflight(vm: QualifiedAccountVm, scope: TenantScope): Promise<void> {
    // Fail closed if the VM lacks rootless Podman, cgroups v2 or seccomp.
    const [rootless, cgroup, seccomp] = await Promise.all([
      command(vm, scope, ['podman', 'info', '--format', '{{.Host.Security.Rootless}}']),
      command(vm, scope, ['podman', 'info', '--format', '{{.Host.CgroupVersion}}']),
      command(vm, scope, ['podman', 'info', '--format', '{{.Host.Security.SeccompEnabled}}']),
    ]);
    if (rootless !== 'true' || cgroup !== 'v2' || seccomp !== 'true') {
      throw new Error('Linux guest isolation prerequisites are unverified');
    }
  }

  async function assertOwnership(
    vm: QualifiedAccountVm, scope: TenantScope, containerId: string,
  ): Promise<void> {
    if (!CID.test(containerId)) throw new Error('Invalid guest container identity');
    const expected = workspaceComputeNamespace(ownerFromScope(scope), scope.workspaceId);
    const raw = await command(vm, scope, [
      'podman', 'inspect', '--format', '{{json .Config.Labels}}', containerId,
    ]);
    let labels: Record<string, unknown>;
    try {
      labels = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error('Guest ownership attestation invalid');
    }
    if (!labels || labels['lattice.workspace.namespace'] !== expected ||
        labels['lattice.account.ownerHash'] !== expected.split('-')[1]) {
      // Never operate on a guest from another workspace or account.
      throw new Error('Guest ownership attestation mismatch');
    }
  }

  async function verifiedGuest(
    containerId: string, scope: TenantScope,
  ): Promise<QualifiedAccountVm> {
    const vm = await vmFor(scope);
    await assertOwnership(vm, scope, containerId);
    return vm;
  }

  return {
    id: 'rootless-podman-a3-3-unqualified',

    async createGuest(workspaceId, namespace, scope) {
      const vm = await vmFor(scope);
      if (scope.workspaceId !== workspaceId ||
          namespace !== workspaceComputeNamespace(ownerFromScope(scope), workspaceId)) {
        throw new Error('Workspace namespace mismatch');
      }
      await preflight(vm, scope);
      const args = [
        'podman', 'run', '--detach',
        '--name', guestName(namespace),
        '--label', 'lattice.workspace.namespace=' + namespace,
        '--label', 'lattice.account.ownerHash=' + namespace.slice(3),
        '--pull=never',
        '--userns=auto',
        '--user=65532:65532',
        '--network=none', '--pid=private', '--ipc=private', '--uts=private',
        '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--read-only', '--read-only-tmpfs=false',
        '--pids-limit=' + config.maxPids,
        '--memory=' + config.memoryMb + 'm',
        '--cpus=' + config.cpuLimit,
        '--tmpfs', '/workspace:rw,nosuid,nodev,noexec,size=' + config.workspaceTmpfsMb + 'm,mode=0700',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
        config.imageDigest,
        'sleep', 'infinity',
      ];
      const id = await command(vm, scope, args);
      if (!CID.test(id)) throw new Error('Guest creation outcome uncertain; reconcile manually');
      await assertOwnership(vm, scope, id);
      return { desktopId: id };
    },

    async startGuest(containerId, scope) {
      const vm = await verifiedGuest(containerId, scope);
      const phase = await command(vm, scope, [
        'podman', 'inspect', '--format', '{{.State.Status}}', containerId,
      ]);
      if (phase === 'paused') {
        await command(vm, scope, ['podman', 'unpause', containerId]);
      } else if (phase === 'exited' || phase === 'created') {
        await command(vm, scope, ['podman', 'start', containerId]);
      } else if (phase !== 'running') {
        throw new Error('Guest state must be reconciled');
      }
    },

    async suspendGuest(containerId, scope) {
      const vm = await verifiedGuest(containerId, scope);
      await command(vm, scope, ['podman', 'pause', containerId]);
    },

    async destroyGuest(containerId, scope) {
      const vm = await verifiedGuest(containerId, scope);
      await command(vm, scope, ['podman', 'rm', '--force', containerId]);
    },

    async healthGuest(containerId, scope) {
      const vm = await verifiedGuest(containerId, scope);
      const phase = await command(vm, scope, [
        'podman', 'inspect', '--format', '{{.State.Status}}', containerId,
      ]);
      return { healthy: phase === 'running' };
    },

    async inspectGuest(_containerId, _scope): Promise<{ phase: GuestPhase; generation: number } | null> {
      // Podman runtime generation is not authoritative. A3.4 must supply
      // the durable generation-fenced guest state. Never invent a generation.
      throw new Error('Durable guest generation unavailable until A3.4');
    },
  };
}
