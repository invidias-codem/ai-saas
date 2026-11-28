/** A3.3 guest adapter tests — mocked VM command transport, NOT live isolation. */
import { workspaceComputeNamespace } from '@/lib/intelligence/execution/accountCompute/contracts';
import {
  createRootlessPodmanGuestProvider,
  type GuestVmCommandTransport,
  type QualifiedAccountVm,
} from '@/lib/intelligence/execution/accountCompute/rootlessPodmanGuest';

const flags = [
  'ENABLE_ACCOUNT_COMPUTE',
  'ENABLE_ACCOUNT_COMPUTE_LIFECYCLE',
  'ENABLE_ACCOUNT_COMPUTE_GUEST_RUNTIME',
] as const;
const originals = flags.map((flag) => process.env[flag]);
const id = 'b'.repeat(64);
const image = 'ghcr.io/lattice/guest@sha256:' + 'a'.repeat(64);
const config = {
  imageDigest: image,
  cpuLimit: 1,
  memoryMb: 512,
  workspaceTmpfsMb: 128,
  maxPids: 64,
};
const scope = (owner = 'user_A', workspace = 'workspace_1') => ({
  tenantId: 'user:' + owner,
  workspaceId: workspace,
});
const vm = (owner = 'user_A'): QualifiedAccountVm => ({
  ownerUserId: owner,
  desktopId: 'vm-' + owner,
  runtimeType: 'linux_vm',
  state: 'ready',
  providerQualified: true,
});
function transport(options: { rootless?: string; labels?: Record<string, string> } = {}) {
  const calls: Array<{ accountVmDesktopId: string; argv: readonly string[] }> = [];
  const client: GuestVmCommandTransport = {
    async execute(req) {
      calls.push({ accountVmDesktopId: req.accountVmDesktopId, argv: req.argv });
      const a = req.argv;
      if (a[1] === 'info') {
        if (a[3].includes('Rootless')) return { exitCode: 0, stdout: options.rootless ?? 'true' };
        if (a[3].includes('CgroupVersion')) return { exitCode: 0, stdout: 'v2' };
        return { exitCode: 0, stdout: 'true' };
      }
      if (a[1] === 'run') return { exitCode: 0, stdout: id };
      if (a[1] === 'inspect' && a[3].includes('Labels')) {
        const s = scope();
        const ns = workspaceComputeNamespace(s.tenantId.slice(5), s.workspaceId);
        return {
          exitCode: 0,
          stdout: JSON.stringify(options.labels ?? {
            'lattice.workspace.namespace': ns,
            'lattice.account.ownerHash': ns.slice(3),
          }),
        };
      }
      if (a[1] === 'inspect') return { exitCode: 0, stdout: 'running' };
      return { exitCode: 0, stdout: '' };
    },
  };
  return { client, calls };
}
function enable() {
  for (const name of flags) process.env[name] = 'true';
}
beforeEach(() => {
  for (const name of flags) delete process.env[name];
});
afterAll(() => {
  flags.forEach((name, index) => {
    const original = originals[index];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  });
});

describe('A3.3 — disabled rootless VM adapter contracts', () => {
  it('rejects every operation unless all three feature flags are set', async () => {
    const { client, calls } = transport();
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    await expect(provider.createGuest('workspace_1', workspaceComputeNamespace('user_A', 'workspace_1'), scope()))
      .rejects.toThrow('disabled');
    expect(calls).toHaveLength(0);
  });

  it('creates an isolated, network-denied rootless guest with bounded resources and no host mounts', async () => {
    enable();
    const { client, calls } = transport();
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    const ns = workspaceComputeNamespace('user_A', 'workspace_1');
    const created = await provider.createGuest('workspace_1', ns, scope());
    expect(created.desktopId).toBe(id);
    const a = calls.find((call) => call.argv[1] === 'run')?.argv;
    expect(a).toBeDefined();
    for (const flag of ['--userns=auto', '--network=none', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--read-only', '--pid=private',
      '--ipc=private', '--pids-limit=64', '--memory=512m', '--cpus=1', '--pull=never']) {
      expect(a).toContain(flag);
    }
    expect(a).toContain(image);
    expect(a).toContain('lattice-' + ns);
    expect(a).not.toContain('--privileged');
    expect(a).not.toContain('--network=host');
    expect(a).not.toContain('--volume');
    expect(a).not.toContain('--env');
    expect(a).not.toContain('sh');
    expect(calls.every((call) => call.accountVmDesktopId === 'vm-user_A')).toBe(true);
  });

  it('rejects forged workspace namespaces before any provider call', async () => {
    enable();
    const { client, calls } = transport();
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    await expect(provider.createGuest('workspace_1', workspaceComputeNamespace('user_B', 'workspace_1'), scope()))
      .rejects.toThrow('mismatch');
    expect(calls).toHaveLength(0);
  });

  it('never uses a container-class account VM', async () => {
    enable();
    const { client, calls } = transport();
    const provider = createRootlessPodmanGuestProvider(
      async () => ({ ...vm(), runtimeType: 'container' }), client, config,
    );
    await expect(provider.createGuest('workspace_1', workspaceComputeNamespace('user_A', 'workspace_1'), scope()))
      .rejects.toThrow('Qualified account Linux VM unavailable');
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the host reports non-rootless Podman', async () => {
    enable();
    const { client, calls } = transport({ rootless: 'false' });
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    await expect(provider.createGuest('workspace_1', workspaceComputeNamespace('user_A', 'workspace_1'), scope()))
      .rejects.toThrow('isolation prerequisites');
    expect(calls.some((call) => call.argv[1] === 'run')).toBe(false);
  });

  it('denies destructive commands when ownership labels do not match the current workspace', async () => {
    enable();
    const { client, calls } = transport({
      labels: { 'lattice.workspace.namespace': 'ws-' + 'f'.repeat(32),
        'lattice.account.ownerHash': 'f'.repeat(32) },
    });
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    await expect(provider.destroyGuest(id, scope())).rejects.toThrow('ownership attestation mismatch');
    expect(calls.some((call) => call.argv[1] === 'rm')).toBe(false);
  });

  it('never invents a durable generation from container inspection', async () => {
    enable();
    const { client } = transport();
    const provider = createRootlessPodmanGuestProvider(async () => vm(), client, config);
    await expect(provider.inspectGuest(id, scope())).rejects.toThrow('until A3.4');
  });

  it('rejects mutable images, unbounded resources, and unpinned configurations', () => {
    const { client } = transport();
    expect(() => createRootlessPodmanGuestProvider(async () => vm(), client, {
      ...config, imageDigest: 'node:latest',
    })).toThrow('Invalid pinned image');
    expect(() => createRootlessPodmanGuestProvider(async () => vm(), client, {
      ...config, maxPids: -1,
    })).toThrow('Invalid pinned image');
  });
});
