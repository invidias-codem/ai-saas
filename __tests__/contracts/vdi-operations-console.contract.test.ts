// __tests__/contracts/vdi-operations-console.contract.test.ts
// VDI-3B acceptance: fleet inventory + desktop detail over stored
// observations, with the access boundary enforced server-side.
//
// Proves:
//   1. Authorized operators see ONLY their permitted fleet (workspace-scoped).
//   2. Direct requests for unauthorized desktop IDs fail server-side.
//   3. Inventory permission grants no viewer tokens / screen or file access
//      (console module has no grant-minting path at all).
//   4. healthy → display failure → provider outage → recovery renders
//      accurately, with freshness beside each fact; suspended shows guest
//      health as unknown.
//   5. Viewing inventory/detail causes NO provisioning or lifecycle
//      mutations (provider interaction count stays zero; broker rows byte-identical).
//   6. Concurrent observations: an older collection never overwrites newer.

import { FleetObserver } from '@/lib/vdi/fleet/fleetObserver';
import { OperationsConsole, OperatorAuthorizer } from '@/lib/vdi/fleet/operationsConsole';
import { createDurableDesktopBroker, DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { DesktopSpec, DesktopPolicy, DesktopPhase, IdempotentProvisioner, TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import * as mem from '@/lib/vdi/store/memoryDesktopStore';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const OTHER_SCOPE: TenantScope = { tenantId: 'tenant-2', workspaceId: 'ws-2' };
const OPERATOR = 'operator-1';
const OUTSIDER = 'operator-2';
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

/** Provider that COUNTS reads — proves viewing never touches it. */
function makeProvider() {
  const resources = new Map<string, { phase: DesktopPhase; labels: Record<string, string> }>();
  let outage = false;
  let reads = 0;
  const provider = {
    async createDesktop(spec: DesktopSpec, scope: TenantScope) {
      const providerId = `sb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      resources.set(providerId, {
        phase: 'ready',
        labels: { 'lattice-tenant': scope.tenantId, 'lattice-workspace': scope.workspaceId, 'lattice-desktop-id': providerId },
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
      reads++;
      if (outage) throw new Error('provider API unreachable');
      const r = resources.get(providerId);
      return r ? { phase: r.phase } : null;
    },
    async getResourceClass() { reads++; return 'container'; },
    async listProviderDesktops(scope: TenantScope) {
      reads++;
      return Array.from(resources.entries())
        .filter(([, r]) => r.labels['lattice-tenant'] === scope.tenantId && r.labels['lattice-workspace'] === scope.workspaceId)
        .map(([providerId, r]) => ({ providerId, phase: r.phase, labels: r.labels }));
    },
    // test controls
    get readCount() { return reads; },
    setOutage(v: boolean) { outage = v; },
  };
  return provider;
}

function makeGuest() {
  let displayHealthy = true;
  return {
    async checkDisplay() { return displayHealthy ? { healthy: true } : { healthy: false, error: 'display service down' }; },
    setDisplayHealthy(v: boolean) { displayHealthy = v; },
  };
}

/** Operator authorizer: OPERATOR may see ws-1 only. */
const authorizer: OperatorAuthorizer = {
  async authorize(operatorUserId: string, requestedWorkspaceId: string) {
    if (operatorUserId === OPERATOR && requestedWorkspaceId === SCOPE.workspaceId) return SCOPE;
    const err = new Error('Forbidden: operator not authorized for workspace');
    (err as Error & { status?: number }).status = 403;
    throw err;
  },
};

function makeBroker(provider: ReturnType<typeof makeProvider>): DurableDesktopBroker {
  return createDurableDesktopBroker(memoryStore, provider as any, opKeyStore(), defaultPolicy,
    (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

beforeEach(() => { mem.resetMemoryStore(); });

describe('VDI-3B Operations Console — access boundary', () => {
  it('1: authorized operator sees only their permitted fleet', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const console = new OperationsConsole(memoryStore, authorizer);

    const mine = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.create(DESKTOP_SPEC, OTHER_SCOPE); // another tenant's desktop

    const fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet).toHaveLength(1);
    expect(fleet[0].desktopId).toBe(mine.desktopId);
    expect(fleet.every(e => e.workspaceId === 'ws-1' && e.tenantId === 'tenant-1')).toBe(true);
  });

  it('2: direct requests for unauthorized desktop IDs fail server-side', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const console = new OperationsConsole(memoryStore, authorizer);

    // Desktop owned by ANOTHER workspace
    const foreign = await broker.create(DESKTOP_SPEC, OTHER_SCOPE);

    // Authorized operator asking for the foreign ID → not found (scoped query,
    // no existence leak)
    const detail = await console.getDesktopDetail(OPERATOR, 'ws-1', foreign.desktopId);
    expect(detail).toBeNull();

    // Operator without permission for that workspace → thrown 403
    await expect(console.getDesktopDetail(OUTSIDER, 'ws-1', 'any-id')).rejects.toThrow(/Forbidden/);
    await expect(console.listFleet(OUTSIDER, 'ws-1')).rejects.toThrow(/Forbidden/);
  });

  it('3: inventory permission grants no viewer tokens or screen/file access', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const console = new OperationsConsole(memoryStore, authorizer);
    const d = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(d.desktopId, 'user-1', 60_000, SCOPE);

    // Inventory read succeeds...
    const fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet).toHaveLength(1);

    // ...and mints NOTHING: the operator is absent from the grant table.
    // The only connection grant is user-1's session grant (created above);
    // no operator grant exists for any desktop.
    const grants = await mem.getActiveSessionLease(d.desktopId, SCOPE);
    expect(grants?.user_id).toBe('user-1'); // unchanged, operator never added
    // Console exposes no createViewerConnectionGrant / connectionGrant fields.
    expect(Object.keys(fleet[0]).some(k => /grant|token/i.test(k))).toBe(false);
  });
});

describe('VDI-3B Operations Console — rendering the observation scenario', () => {
  it('4: healthy → display failure → provider outage → recovery renders accurately with freshness', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const console = new OperationsConsole(memoryStore, authorizer);
    let tick = 0;
    const clock = { now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await observer.observeWorkspace(SCOPE);

    // healthy
    let fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet[0].providerReachable).toBe(true);
    expect(fleet[0].providerPhase).toBe('ready');
    expect(fleet[0].guestDisplayHealthy).toBe(true);
    expect(fleet[0].providerStatusText).toMatch(/Provider reports ready/);

    // display broken — lifecycle ≠ display
    guest.setDisplayHealthy(false);
    await observer.observeWorkspace(SCOPE);
    fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet[0].providerPhase).toBe('ready');
    expect(fleet[0].guestDisplayHealthy).toBe(false);
    expect(fleet[0].brokerPhase).toBe('ready');

    // provider outage — retained history cannot appear current
    provider.setOutage(true);
    await observer.observeWorkspace(SCOPE);
    fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet[0].providerReachable).toBe(false);
    expect(fleet[0].providerStatusText).toMatch(/Provider unreachable; last reported ready at/);
    expect(fleet[0].providerObservedAt).not.toBe(fleet[0].observedAt); // freshness beside the fact
    expect(fleet[0].guestDisplayHealthy).toBeNull(); // unknown during outage

    // recovery
    provider.setOutage(false);
    guest.setDisplayHealthy(true);
    await observer.observeWorkspace(SCOPE);
    fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet[0].providerReachable).toBe(true);
    expect(fleet[0].guestDisplayHealthy).toBe(true);
    expect(fleet[0].providerStatusText).toMatch(/Provider reports ready/);
  });

  it('5: viewing inventory and detail causes no provisioning or lifecycle mutations', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const guest = makeGuest();
    const observer = new FleetObserver(memoryStore, provider, guest, { now: () => new Date().toISOString() });
    const console = new OperationsConsole(memoryStore, authorizer);

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await observer.observeWorkspace(SCOPE);
    const before = await mem.getDesktopById(desktop.desktopId, SCOPE);
    const readsBefore = provider.readCount;

    // Repeated viewing
    for (let i = 0; i < 3; i++) {
      await console.listFleet(OPERATOR, 'ws-1');
      await console.getDesktopDetail(OPERATOR, 'ws-1', desktop.desktopId);
    }

    const after = await mem.getDesktopById(desktop.desktopId, SCOPE);
    expect(provider.readCount).toBe(readsBefore); // zero provider interaction
    expect(after).toEqual(before);               // broker row byte-identical
    expect(after!.generation).toBe(before!.generation);
  });

  it('6: suspended desktop shows guest health as unknown', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const console = new OperationsConsole(memoryStore, authorizer);
    const observer = new FleetObserver(memoryStore, provider, guest, { now: () => new Date().toISOString() });

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.suspend(desktop.desktopId, SCOPE);
    await observer.observeWorkspace(SCOPE);
    const fleet = await console.listFleet(OPERATOR, 'ws-1');
    expect(fleet[0].brokerPhase).toBe('suspended');
    expect(fleet[0].guestDisplayHealthy).toBeNull(); // unknown, not healthy/failed
  });

  it('7: concurrent observations — an older collection never overwrites newer facts', async () => {
    // Newer collection (collectedAt = T2) lands first; slower collection
    // (started at T1, finishes later) must be dropped, not overwrite.
    await mem.recordObservation({
      desktopId: 'dt-x', providerReachable: true, providerPhase: 'suspended',
      providerClass: 'container', providerObservedAt: 'T2', providerError: null,
      guestDisplayHealthy: true, guestError: null, guestObservedAt: 'T2',
      brokerPhase: 'suspended', generation: 5, sessionLeaseActive: false,
      executionLeaseActive: false, inputControlHolder: null, lastOperationKey: null,
      collectedAt: '2026-10-11T00:00:02.000Z',
    });
    await mem.recordObservation({
      desktopId: 'dt-x', providerReachable: true, providerPhase: 'ready',
      providerClass: 'container', providerObservedAt: 'T1', providerError: null,
      guestDisplayHealthy: true, guestError: null, guestObservedAt: 'T1',
      brokerPhase: 'ready', generation: 3, sessionLeaseActive: false,
      executionLeaseActive: false, inputControlHolder: null, lastOperationKey: null,
      collectedAt: '2026-10-11T00:00:01.000Z', // OLDER collection, late write
    });
    const obs: any = await mem.getObservation('dt-x');
    expect(obs.providerPhase).toBe('suspended');   // newer fact survives
    expect(obs.generation).toBe(5);
    expect(obs.providerObservedAt).toBe('T2');
  });
});
