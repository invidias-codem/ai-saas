// __tests__/contracts/vdi-fleet-observations.contract.test.ts
// VDI-3A acceptance: fleet observations keep provider report, guest/display
// health, broker state, leases and freshness SEPARATE.
//
// The specified first scenario, end to end:
//   1. healthy desktop → observation shows provider ready + display healthy
//   2. break the display service → provider still ready, display unhealthy
//   3. interrupt provider observation (API outage) → unreachable + error,
//      PREVIOUS provider report retained WITH ITS TIMESTAMP; broker state,
//      ownership, generation untouched
//   4. recover both → observation resolves to ready + healthy
//
// Plus: orphan discovery quarantines (evidence recorded, never destroys).

import { FleetObserver } from '@/lib/vdi/fleet/fleetObserver';
import { createDurableDesktopBroker, DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { DesktopSpec, DesktopPolicy, DesktopPhase, IdempotentProvisioner, TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import * as mem from '@/lib/vdi/store/memoryDesktopStore';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const USER_ID = 'user-1';
const AGENT_ID = 'agent-1';
const DESKTOP_SPEC: DesktopSpec = {
  runtimeType: 'container', persistence: 'workspace', imageVersion: 'ubuntu:22.04',
  memoryMb: 2048, cpuShares: 1, storageGb: 10,
};
const defaultPolicy: DesktopPolicy = { maxIdleMs: 20 * 60 * 1000, egressPolicy: 'deny_all' };

const memoryStore: DesktopStore = {
  createDesktop: mem.createDesktop, getDesktopById: mem.getDesktopById,
  getDesktopByProviderId: mem.getDesktopByProviderId,
  updateDesktopPhase: mem.updateDesktopPhase, updateDesktopResumeKey: mem.updateDesktopResumeKey,
  listDesktops: mem.listDesktops, grantSessionLease: mem.grantSessionLease,
  revokeSessionLease: mem.revokeSessionLease, getActiveSessionLease: mem.getActiveSessionLease,
  grantExecutionLease: mem.grantExecutionLease, revokeExecutionLease: mem.revokeExecutionLease,
  getActiveExecutionLease: mem.getActiveExecutionLease, createConnectionGrant: mem.createConnectionGrant,
  revokeConnectionGrants: mem.revokeConnectionGrants, validateConnectionGrant: mem.validateConnectionGrant,
  grantInputControlLease: mem.grantInputControlLease, revokeInputControlLease: mem.revokeInputControlLease,
  getActiveInputControlLease: mem.getActiveInputControlLease, checkOperationKey: mem.checkOperationKey,
  recordOperationKey: mem.recordOperationKey, recordEvidence: mem.recordEvidence,
  recordObservation: mem.recordObservation, getObservation: mem.getObservation,
  recordRemediationAttempt: mem.recordRemediationAttempt, getRemediationAttempts: mem.getRemediationAttempts,
  claimRemediationOperation: mem.claimRemediationOperation, updateRemediationOperation: mem.updateRemediationOperation, getRemediationOperation: mem.getRemediationOperation,
  admitReservation: mem.admitReservation, resolveProvisioning: mem.resolveProvisioning, settleReservation: mem.settleReservation,
  adjustSettledCharge: mem.adjustSettledCharge, extendReservationHorizon: mem.extendReservationHorizon,
  getBudget: mem.getBudget, getReservation: mem.getReservation,
  upsertAlert: mem.upsertAlert, listAlerts: mem.listAlerts,
  getUsageRecord: mem.getUsageRecord, recordUsage: mem.recordUsage, listUsage: mem.listUsage,
  canSuspendDesktop: mem.canSuspendDesktop,
  validateWorkspaceMembership: mem.validateWorkspaceMembership,
  validateWorkspaceOwnership: mem.validateWorkspaceOwnership,
};

function opKeyStore(): IdempotentProvisioner {
  const store = new Map<string, any>();
  return {
    checkOperationKey: async k => {
      const v = store.get(k);
      if (!v) return null;
      if ('desktopId' in v) return { desktopId: v.desktopId };
      if ('status' in v) return { status: v.status };
      return null;
    },
    recordOperationKey: async (k, o) => { store.set(k, o); },
  };
}

/** Fake provider with togglable outage + observable resources. */
function makeProvider() {
  const resources = new Map<string, { phase: DesktopPhase; labels: Record<string, string> }>();
  let outage = false;
  const provider = {
    async createDesktop(spec: DesktopSpec, scope: TenantScope) {
      const providerId = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      resources.set(providerId, {
        phase: 'ready',
        labels: {
          'lattice-tenant': scope.tenantId, 'lattice-workspace': scope.workspaceId,
          'lattice-desktop-id': providerId,
        },
      });
      return { desktopId: providerId, providerId, resumeKey: providerId };
    },
    async resumeDesktop() {},
    async executeDesktop() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 1 }; },
    async snapshotDesktop() { return { snapshotId: 's' }; },
    async suspendDesktop(_d: string, providerId: string) {
      const r = resources.get(providerId); if (r) r.phase = 'suspended';
    },
    async destroyDesktop(_d: string, providerId: string) { resources.delete(providerId); },
    async getDesktopState(providerId: string) {
      if (outage) throw new Error('provider API unreachable');
      const r = resources.get(providerId);
      return r ? { phase: r.phase } : null;
    },
    async getResourceClass() { return 'container'; },
    async listProviderDesktops(scope: TenantScope) {
      return Array.from(resources.entries())
        .filter(([, r]) => r.labels['lattice-tenant'] === scope.tenantId && r.labels['lattice-workspace'] === scope.workspaceId)
        .map(([providerId, r]) => ({ providerId, phase: r.phase, labels: r.labels }));
    },
    // test controls
    setOutage(v: boolean) { outage = v; },
    inject(providerId: string, r: { phase: DesktopPhase; labels: Record<string, string> }) { resources.set(providerId, r); },
    drop(providerId: string) { resources.delete(providerId); },
  };
  return provider;
}

/** Fake guest/display health with togglable failure. */
function makeGuest() {
  let displayHealthy = true;
  return {
    async checkDisplay(_d: string, providerId: string) {
      void providerId;
      return displayHealthy ? { healthy: true } : { healthy: false, error: 'display service down' };
    },
    setDisplayHealthy(v: boolean) { displayHealthy = v; },
  };
}

function makeBroker(provider: ReturnType<typeof makeProvider>): DurableDesktopBroker {
  return createDurableDesktopBroker(memoryStore, provider as any, opKeyStore(), defaultPolicy,
    (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

beforeEach(() => { mem.resetMemoryStore(); });

describe('VDI-3A Fleet Observations — the first acceptance scenario', () => {
  it('healthy → display broken → provider outage → both recovered; observation distinguishes every condition', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    // Deterministic clock: each observe run advances one tick so retained vs
    // fresh timestamps are distinguishable.
    let tick = 0;
    const clock = { now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);

    // ── 1. Healthy desktop ──
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, USER_ID, 60_000, SCOPE);
    let r = await observer.observeWorkspace(SCOPE);
    expect(r.observed).toBe(1);
    expect(r.providerOutages).toBe(0);
    let obs = await mem.getObservation(desktop.desktopId) as any;
    expect(obs.providerReachable).toBe(true);
    expect(obs.providerPhase).toBe('ready');
    expect(obs.providerClass).toBe('container');        // observed class recorded
    expect(obs.guestDisplayHealthy).toBe(true);
    expect(obs.brokerPhase).toBe('ready');               // intended state
    expect(obs.sessionLeaseActive).toBe(true);          // lease authorizes activity
    expect(obs.lastOperationKey).toMatch(/^vdi:create:/); // explains the transition
    const healthyObservedAt = obs.providerObservedAt as string;
    const healthyGeneration = obs.generation as number;

    // ── 2. Break the display service ── provider still ready, display down.
    guest.setDisplayHealthy(false);
    r = await observer.observeWorkspace(SCOPE);
    expect(r.displayFailures).toBe(1);
    obs = await mem.getObservation(desktop.desktopId) as any;
    expect(obs.providerPhase).toBe('ready');            // lifecycle ≠ display
    expect(obs.guestDisplayHealthy).toBe(false);
    expect(obs.guestError).toBe('display service down');
    expect(obs.providerReachable).toBe(true);
    // The display-broken pass was a SUCCESSFUL provider read: its timestamp
    // is the one the outage pass must retain.
    const lastGoodObservedAt = obs.providerObservedAt as string;
    expect(lastGoodObservedAt).not.toBe(healthyObservedAt);

    // ── 3. Provider outage ── previous report retained; broker untouched.
    provider.setOutage(true);
    r = await observer.observeWorkspace(SCOPE);
    expect(r.providerOutages).toBe(1);
    obs = await mem.getObservation(desktop.desktopId) as any;
    expect(obs.providerReachable).toBe(false);
    expect(obs.providerError).toBe('provider API unreachable');
    expect(obs.providerPhase).toBe('ready');            // LAST GOOD report kept
    expect(obs.providerObservedAt).toBe(lastGoodObservedAt); // ...with its timestamp
    expect(obs.guestDisplayHealthy).toBeNull();          // unknown, not healthy/failed
    expect(obs.guestObservedAt).not.toBe(obs.providerObservedAt); // freshness separate

    // Authoritative state untouched by the outage:
    const row = await mem.getDesktopById(desktop.desktopId, SCOPE);
    expect(row!.phase).toBe('ready');
    expect(row!.generation).toBe(healthyGeneration);
    expect(row!.session_lease_id).not.toBeNull();

    // ── 4. Recover both ── observation resolves to healthy.
    provider.setOutage(false);
    guest.setDisplayHealthy(true);
    r = await observer.observeWorkspace(SCOPE);
    expect(r.providerOutages).toBe(0);
    expect(r.displayFailures).toBe(0);
    obs = await mem.getObservation(desktop.desktopId) as any;
    expect(obs.providerReachable).toBe(true);
    expect(obs.providerPhase).toBe('ready');
    expect(obs.guestDisplayHealthy).toBe(true);
    expect(obs.guestError).toBeNull();
    expect(obs.providerObservedAt).not.toBe(healthyObservedAt); // fresh observation
  });

  it('suspended provider resource with healthy display: lifecycle and guest health shown separately', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const observer = new FleetObserver(memoryStore, provider, guest, { now: () => new Date().toISOString() });

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.suspend(desktop.desktopId, SCOPE);
    await observer.observeWorkspace(SCOPE);
    const obs = await mem.getObservation(desktop.desktopId) as any;
    // Provider reports suspended; broker desired state matches; but the guest
    // display check was skipped (provider reachable, but resource stopped) —
    // shown as unknown, NOT 'healthy'.
    expect(obs.providerPhase).toBe('suspended');
    expect(obs.brokerPhase).toBe('suspended');
  });

  it('orphan discovery quarantines — evidence recorded, provider resource never destroyed', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const observer = new FleetObserver(memoryStore, provider, guest, { now: () => new Date().toISOString() });

    // Provider has our desktop; store has none.
    provider.inject('sb-orphan-xyz', {
      phase: 'ready',
      labels: { 'lattice-tenant': 'tenant-1', 'lattice-workspace': 'ws-1', 'lattice-operation-key': 'vdi:create:tenant-1:ws-1:deadbeef:v1' },
    });

    const r = await observer.observeWorkspace(SCOPE);
    expect(r.orphansQuarantined).toBe(1);
    // Quarantine evidence recorded with retirement requirements...
    const quarantine = await mem.getObservation('sb-orphan-xyz');
    expect(quarantine).toBeNull(); // orphan is NOT a desktop row — evidence-only
  });

  it('execution lease activity and input-control holder captured in the observation', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const observer = new FleetObserver(memoryStore, provider, guest, { now: () => new Date().toISOString() });

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, USER_ID, 60_000, SCOPE);
    await broker.releaseTakeover(desktop.desktopId, USER_ID, SCOPE);
    await broker.grantExecution(desktop.desktopId, AGENT_ID, 60_000, SCOPE);

    await observer.observeWorkspace(SCOPE);
    const obs = await mem.getObservation(desktop.desktopId) as any;
    expect(obs.executionLeaseActive).toBe(true);
    expect(obs.inputControlHolder).toMatch(/^agent:/);
  });
});
