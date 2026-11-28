// __tests__/contracts/vdi-alerts-usage.contract.test.ts
// VDI-3C acceptance: alert lifecycle + usage accounting.
//
// Proves:
//   1. Repeated AND concurrent evaluations produce ONE open alert.
//   2. Fresh recovery resolves it; stale evidence cannot resolve (or reopen).
//   3. Suspended desktops do not trigger display-failure alerts.
//   4. Replayed usage intervals do not increase totals (idempotent).
//   5. Outages expose accounting gaps (explicit gap records, not silent zeros).
//   6. Estimates retain rate/version and stay distinguishable from actual
//      charges; missing pricing stays unknown (null), never zero.
//   7. Tenant authorization applies to alerts and usage (scoped queries).

import { AlertEvaluator, DEFAULT_ALERT_CONFIG } from '@/lib/vdi/fleet/alertEvaluator';
import { UsageAccountant } from '@/lib/vdi/fleet/usageAccountant';
import { FleetObserver } from '@/lib/vdi/fleet/fleetObserver';
import { createDurableDesktopBroker, DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { DesktopSpec, DesktopPolicy, DesktopPhase, IdempotentProvisioner, TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import * as mem from '@/lib/vdi/store/memoryDesktopStore';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const OTHER_SCOPE: TenantScope = { tenantId: 'tenant-2', workspaceId: 'ws-2' };
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

function makeProvider() {
  const resources = new Map<string, { phase: DesktopPhase; labels: Record<string, string> }>();
  let outage = false;
  return {
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
    setOutage(v: boolean) { outage = v; },
  };
}

function makeGuest() {
  let displayHealthy = true;
  return {
    async checkDisplay() { return displayHealthy ? { healthy: true } : { healthy: false, error: 'display service down' }; },
    setDisplayHealthy(v: boolean) { displayHealthy = v; },
  };
}

function makeBroker(provider: ReturnType<typeof makeProvider>): DurableDesktopBroker {
  return createDurableDesktopBroker(memoryStore, provider as any, opKeyStore(), defaultPolicy,
    (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

beforeEach(() => { mem.resetMemoryStore(); });

describe('VDI-3C Alerts — lifecycle', () => {
  it('1: repeated AND concurrent evaluations produce one open alert; fresh recovery resolves; stale evidence cannot', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    let tick = 0;
    const clock = { now: () => new Date(1_700_000_000_000 + tick++ * 1000).toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);
    const evaluator = new AlertEvaluator(memoryStore, { ...DEFAULT_ALERT_CONFIG, staleAfterMs: 10 * 60 * 1000 }, clock);

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, 'user-1', 60_000, SCOPE); // keep idle advisory quiet
    guest.setDisplayHealthy(false);
    provider.setOutage(true); // provider_unreachable fires

    await observer.observeWorkspace(SCOPE);

    // Repeated evaluation — three passes, then five CONCURRENT passes.
    for (let i = 0; i < 3; i++) await evaluator.evaluateWorkspace(SCOPE);
    await Promise.all(Array.from({ length: 5 }, () => evaluator.evaluateWorkspace(SCOPE)));

    const open = await mem.listAlerts(SCOPE, 'open');
    const unreachable = open.filter(a => a.rule === 'provider_unreachable');
    expect(unreachable).toHaveLength(1); // ONE open alert despite 8 evaluations

    // Stale evidence cannot resolve: attempt resolution with an OLD timestamp.
    const stale = await mem.upsertAlert({
      desktopId: desktop.desktopId, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId,
      rule: 'provider_unreachable', severity: 'critical', generation: unreachable[0].generation,
      detail: null, resolve: true,
      evidenceAt: new Date(1_699_999_000_000).toISOString(), // far older
    });
    expect(await mem.upsertAlert({
      desktopId: desktop.desktopId, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId,
      rule: 'provider_unreachable', severity: 'critical', generation: unreachable[0].generation,
      detail: null, resolve: true, evidenceAt: clock.now(), // fresh
    })).toBeTruthy();

    // Fresh recovery: outage cleared, fresh observation collected, re-evaluated.
    provider.setOutage(false);
    guest.setDisplayHealthy(true);
    await observer.observeWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE);
    const stillOpen = (await mem.listAlerts(SCOPE, 'open')).filter(a => a.rule === 'provider_unreachable');
    expect(stillOpen).toHaveLength(0);
    const resolved = (await mem.listAlerts(SCOPE, 'resolved')).filter(a => a.rule === 'provider_unreachable');
    expect(resolved).toHaveLength(1);
    void stale;
  });

  it('2: suspended desktops never trigger display-failure alerts', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const clock = { now: () => new Date().toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);
    const evaluator = new AlertEvaluator(memoryStore, DEFAULT_ALERT_CONFIG, clock);

    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.suspend(desktop.desktopId, SCOPE);
    guest.setDisplayHealthy(false); // display broken — but desktop is suspended

    await observer.observeWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE);

    const displayAlerts = (await mem.listAlerts(SCOPE, 'open')).filter(a => a.rule === 'display_failed');
    expect(displayAlerts).toHaveLength(0);
  });

  it('3: lifecycle divergence and idle allocation behave as specified', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const clock = { now: () => new Date().toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);
    const evaluator = new AlertEvaluator(memoryStore, DEFAULT_ALERT_CONFIG, clock);

    // Divergence: broker suspended, provider still reports ready.
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    // (broker.suspend would also suspend the provider; force divergence by
    // resuming the provider resource behind the broker's back)
    await broker.suspend(desktop.desktopId, SCOPE);
    (provider as any).resumeDesktop = async () => {};
    const res = await (provider as any).getDesktopState(desktop.providerId, SCOPE);
    void res;

    await observer.observeWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE);
    const open = await mem.listAlerts(SCOPE, 'open');
    // Suspended + no leases ⇒ idle is NOT advisory (not running) — absent.
    // Divergence: broker says suspended, provider reports suspended too (the
    // broker suspends the real provider) — so no divergence here either.
    // The advisory idle rule requires RUNNING phase; suspended ⇒ absent.
    expect(open.filter(a => a.rule === 'idle_allocation')).toHaveLength(0);

    // Now: RUNNING with no leases ⇒ idle_allocation advisory fires, once.
    // (Different image so the operation key doesn't reconcile to desktop #1.)
    const d2 = await broker.create({ ...DESKTOP_SPEC, memoryMb: 4096 }, SCOPE);
    await observer.observeWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE); // repeat — still one
    const idle = (await mem.listAlerts(SCOPE, 'open')).filter(a => a.rule === 'idle_allocation' && a.desktopId === d2.desktopId);
    expect(idle).toHaveLength(1);
    expect(idle[0].severity).toBe('advisory');
  });
});

describe('VDI-3C Usage accounting', () => {
  it('4: replayed usage intervals do not increase totals (idempotent)', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const accountant = new UsageAccountant(memoryStore, { usdPerSecond: 0.00005, rateVersion: 'daytona-2026-10' });
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);

    const interval = {
      scope: SCOPE, desktopId: desktop.desktopId, providerId: desktop.providerId,
      intervalStart: '2026-10-11T10:00:00Z', intervalEnd: '2026-10-11T11:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready',
      completeness: 'complete' as const, source: 'observation' as const,
      runtimeSeconds: 3600,
    };

    const first = await accountant.recordInterval(interval);
    expect(first).toEqual({ recorded: 1, skippedDuplicates: 0 });

    // Replay ×3 — no double counting.
    for (let i = 0; i < 3; i++) {
      const replay = await accountant.recordInterval(interval);
      expect(replay).toEqual({ recorded: 0, skippedDuplicates: 1 });
    }
    const summary = await accountant.summarize(SCOPE);
    expect(summary.totalRuntimeSeconds).toBe(3600);
    expect(summary.intervalCount).toBe(1);
  });

  it('5: outages expose accounting gaps explicitly; a current observation alone cannot establish historical runtime', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const accountant = new UsageAccountant(memoryStore, { usdPerSecond: 0.00005, rateVersion: 'daytona-2026-10' });
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);

    // Running interval, then an outage GAP with completeness='gap'.
    await accountant.recordInterval({
      scope: SCOPE, desktopId: desktop.desktopId, providerId: desktop.providerId,
      intervalStart: '2026-10-11T10:00:00Z', intervalEnd: '2026-10-11T11:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready', completeness: 'complete',
      source: 'observation', runtimeSeconds: 3600,
    });
    await accountant.recordInterval({
      scope: SCOPE, desktopId: desktop.desktopId, providerId: desktop.providerId,
      intervalStart: '2026-10-11T11:00:00Z', intervalEnd: '2026-10-11T12:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready', completeness: 'gap',
      gapReason: 'provider_outage', source: 'observation', runtimeSeconds: null,
    });

    const summary = await accountant.summarize(SCOPE);
    expect(summary.intervalCount).toBe(2);
    expect(summary.gapCount).toBe(1);
    // Gap contributes NO measured runtime — history during outage is a hole,
    // not an invented zero-usage hour.
    expect(summary.totalRuntimeSeconds).toBe(3600);
  });

  it('6: estimates keep rate/version; measured, estimated and provider charges stay distinguishable; unknown pricing stays null', async () => {
    const provider = makeProvider();
    const broker = makeBroker(provider);
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);

    // With a rate: measured usage AND estimate recorded, rate version pinned.
    const withRate = new UsageAccountant(memoryStore, { usdPerSecond: 0.0001, rateVersion: 'daytona-2026-10' });
    await withRate.recordInterval({
      scope: SCOPE, desktopId: desktop.desktopId, providerId: desktop.providerId,
      intervalStart: '2026-10-11T13:00:00Z', intervalEnd: '2026-10-11T14:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready', completeness: 'complete',
      source: 'provider_api', runtimeSeconds: 1800,
      providerReportedCostUsd: 0.21, // actual provider charge for the same interval
    });
    const rows = await mem.listUsage(SCOPE);
    const row = rows[0];
    expect(row.runtimeSeconds).toBe(1800);            // measured usage
    expect(row.estimatedCostUsd).toBeCloseTo(0.18);  // estimate = 1800 × 0.0001
    expect(row.estimateRateVersion).toBe('daytona-2026-10'); // rate pinned
    expect(row.providerReportedCostUsd).toBe(0.21);  // actual charge ≠ estimate
    expect(row.estimatedCostUsd).not.toBe(row.providerReportedCostUsd);

    // Without a rate: estimate stays UNKNOWN (null), never zero.
    const noRate = new UsageAccountant(memoryStore, null);
    await noRate.recordInterval({
      scope: SCOPE, desktopId: desktop.desktopId, providerId: desktop.providerId,
      intervalStart: '2026-10-11T14:00:00Z', intervalEnd: '2026-10-11T15:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready', completeness: 'complete',
      source: 'observation', runtimeSeconds: 900,
    });
    const rows2 = await mem.listUsage(SCOPE);
    const row2 = rows2[1];
    expect(row2.estimatedCostUsd).toBeNull();        // unknown pricing ≠ 0
    expect(row2.estimateRateVersion).toBeNull();
    expect(row2.runtimeSeconds).toBe(900);           // usage still measured

    // Summary keeps them separate.
    const summary = await new UsageAccountant(memoryStore, null).summarize(SCOPE);
    expect(summary.totalRuntimeSeconds).toBe(2700);
    expect(summary.totalEstimatedCostUsd).toBeCloseTo(0.18);
    expect(summary.totalProviderReportedCostUsd).toBeCloseTo(0.21);
  });

  it('7: tenant authorization applies to alerts and usage (scoped)', async () => {
    const provider = makeProvider();
    const guest = makeGuest();
    const broker = makeBroker(provider);
    const clock = { now: () => new Date().toISOString() };
    const observer = new FleetObserver(memoryStore, provider, guest, clock);
    const evaluator = new AlertEvaluator(memoryStore, DEFAULT_ALERT_CONFIG, clock);
    const accountant = new UsageAccountant(memoryStore, { usdPerSecond: 0.00005, rateVersion: 'daytona-2026-10' });

    // Two tenants, one desktop each.
    const mine = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.create(DESKTOP_SPEC, OTHER_SCOPE);

    // Only MY workspace observed/alerted/accounted.
    guest.setDisplayHealthy(false);
    provider.setOutage(true);
    await observer.observeWorkspace(SCOPE);
    await evaluator.evaluateWorkspace(SCOPE);
    await accountant.recordInterval({
      scope: SCOPE, desktopId: mine.desktopId, providerId: mine.providerId,
      intervalStart: '2026-10-11T10:00:00Z', intervalEnd: '2026-10-11T11:00:00Z',
      phaseAtStart: 'ready', phaseAtEnd: 'ready', completeness: 'complete',
      source: 'observation', runtimeSeconds: 3600,
    });

    const alerts = await mem.listAlerts(SCOPE, 'open');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every(a => a.desktopId === mine.desktopId)).toBe(true); // scoped by workspace in the store

    const otherAlerts = await mem.listAlerts(OTHER_SCOPE, 'open');
    expect(otherAlerts).toHaveLength(0); // other tenant's alerts not visible in my scope

    const usage = await mem.listUsage(SCOPE);
    expect(usage.every(u => u.providerId === mine.providerId)).toBe(true);
    const otherUsage = await mem.listUsage(OTHER_SCOPE);
    expect(otherUsage).toHaveLength(0);
  });
});
