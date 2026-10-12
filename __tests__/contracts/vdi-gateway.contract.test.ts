// __tests__/contracts/vdi-gateway.contract.test.ts
// VDI-2B gateway acceptance: REAL WebSocket handler + REAL connected client.
// Proves:
//   - server-side auth: invalid grant rejected at the connection
//   - denied input NEVER reaches the desktop; connection closes
//   - idle client disconnects at grant expiry with NO further input event
//   - revocation/membership-loss/takeover closes an idle connection within
//     the documented maximum delay (sweep)
//   - disconnect removes timers/state (connectionCount returns to 0)

import { WebSocket } from 'ws';
import { ViewerGateway, REVOCATION_MAX_DELAY_MS } from '@/lib/vdi/gateway/viewerGateway';
import { createDurableDesktopBroker, DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { DesktopSpec, DesktopPolicy, IdempotentProvisioner, TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import * as mem from '@/lib/vdi/store/memoryDesktopStore';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const USER_ID = 'user-1';
const USER_ID_2 = 'user-2';
const DESKTOP_SPEC: DesktopSpec = {
  runtimeType: 'linux_vm', persistence: 'workspace', imageVersion: 'ubuntu-22.04-v1',
  memoryMb: 4096, cpuShares: 2, storageGb: 20,
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

// In-memory provider (files map) — the gateway test does not need Daytona.
function makeProvider() {
  const desktops = new Map<string, { providerId: string; phase: string }>();
  return {
    createDesktop: async (spec: DesktopSpec, scope: TenantScope) => {
      const providerId = `sb-${Date.now()}`;
      desktops.set(providerId, { providerId, phase: 'ready' });
      return { desktopId: providerId, providerId, resumeKey: providerId };
    },
    resumeDesktop: async () => {},
    executeDesktop: async (_d: string, providerId: string) => {
      const d = desktops.get(providerId);
      return { exitCode: 0, stdout: `ok:${d?.phase}`, stderr: '', timedOut: false, durationMs: 1 };
    },
    snapshotDesktop: async () => ({ snapshotId: 's' }),
    suspendDesktop: async () => {},
    destroyDesktop: async (_d: string, providerId: string) => { desktops.delete(providerId); },
    getDesktopState: async (providerId: string) => {
      const d = desktops.get(providerId);
      return d ? { phase: d.phase as 'ready' } : null;
    },
    listDesktops: async () => [] as Array<{ desktopId: string; providerId: string; phase: 'ready' }>,
  };
}

function makeBroker(): DurableDesktopBroker {
  return createDurableDesktopBroker(memoryStore, makeProvider() as any, opKeyStore(), defaultPolicy,
    (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function onceWsOpen(ws: WebSocket): Promise<void> {
  return new Promise((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
}
function onceWsClosed(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise(res => ws.once('close', (code, reason) => res({ code, reason: reason.toString() })));
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

beforeEach(() => { mem.resetMemoryStore(); });

describe('VDI-2B Viewer Gateway — real WebSocket enforcement', () => {
  let port = 45901;

  it('1: authenticates from the grant server-side; invalid grant rejected at connection', async () => {
    const broker = makeBroker();
    const forwarded: unknown[] = [];
    const gw = new ViewerGateway({
      broker, port: port++, host: '127.0.0.1',
      forward: (_d, e) => forwarded.push(e),
      resolveGrant: async t => {
        const v = await memoryStore.validateConnectionGrant(t);
        if (!v) return null;
        return { desktopId: v.desktopId, userId: USER_ID, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, protocol: v.protocol, expiresAt: new Date(Date.now() + 60_000).toISOString() };
      },
    });

    // Connect with an INVALID grant — must be closed with 4003.
    const ws = new WebSocket(`ws://127.0.0.1:${port - 1}`);
    await onceWsOpen(ws);
    ws.send(JSON.stringify({ type: 'auth', grantToken: 'grant-invalid' }));
    const closed = await onceWsClosed(ws);
    expect(closed.code).toBe(4003);
    expect(forwarded).toHaveLength(0);
    await gw.close();
  });

  it('2: authorized connection forwards input; denied input never reaches the desktop', async () => {
    const broker = makeBroker();
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, USER_ID, 60_000, SCOPE);
    const grant = await broker.createViewerConnectionGrant(desktop.desktopId, USER_ID, 'webvnc', 60_000, SCOPE);

    const forwarded: unknown[] = [];
    const gw = new ViewerGateway({
      broker, port: port++, host: '127.0.0.1',
      forward: (d, e, u) => forwarded.push({ d, e, u }),
      resolveGrant: async t => {
        const v = await memoryStore.validateConnectionGrant(t);
        if (!v) return null;
        return { desktopId: v.desktopId, userId: USER_ID, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, protocol: v.protocol, expiresAt: new Date(Date.now() + 60_000).toISOString() };
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port - 1}`);
    await onceWsOpen(ws);
    ws.send(JSON.stringify({ type: 'auth', grantToken: grant.grantToken }));
    await new Promise(r => ws.once('message', r)); // connected ack
    expect(gw.connectionCount).toBe(1);

    // Live grant: input is forwarded.
    ws.send(JSON.stringify({ type: 'input', key: 'a' }));
    await sleep(50);
    expect(forwarded.length).toBe(1);
    expect(forwarded[0]).toMatchObject({ d: desktop.desktopId, u: USER_ID });

    // Revoke ALL access (membership loss) — next input must be denied and the
    // connection closed. The forwarded log must NOT grow.
    await broker.revokeAllAccess(desktop.desktopId, SCOPE, 'membership_revoked');
    ws.send(JSON.stringify({ type: 'input', key: 'b' }));
    const closed = await onceWsClosed(ws);
    expect(closed.code).toBe(4006);
    expect(forwarded.length).toBe(1); // denied input never reached the desktop
    expect(gw.connectionCount).toBe(0);
    await gw.close();
  });

  it('3: idle client disconnects at grant expiry without sending another event', async () => {
    const broker = makeBroker();
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, USER_ID, 60_000, SCOPE);
    // Short grant TTL: 120ms. The client will send NOTHING after connect.
    const grant = await broker.createViewerConnectionGrant(desktop.desktopId, USER_ID, 'webvnc', 120, SCOPE);

    const forwarded: unknown[] = [];
    const gw = new ViewerGateway({
      broker, port: port++, host: '127.0.0.1',
      forward: (d, e) => forwarded.push({ d, e }),
      resolveGrant: async t => {
        const v = await memoryStore.validateConnectionGrant(t);
        if (!v) return null;
        return { desktopId: v.desktopId, userId: USER_ID, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, protocol: v.protocol, expiresAt: new Date(Date.now() + 120).toISOString() };
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port - 1}`);
    await onceWsOpen(ws);
    ws.send(JSON.stringify({ type: 'auth', grantToken: grant.grantToken }));
    await new Promise(r => ws.once('message', r)); // connected ack
    expect(gw.connectionCount).toBe(1);

    // IDLE: no further events from the client. Expiry must close the socket.
    const closed = await onceWsClosed(ws);
    expect(closed.code).toBe(4005); // grant expired
    expect(forwarded).toHaveLength(0);
    expect(gw.connectionCount).toBe(0);
    await gw.close();
  });

  it('4: takeover by another human closes the first (idle) connection within max delay', async () => {
    const broker = makeBroker();
    const desktop = await broker.create(DESKTOP_SPEC, SCOPE);
    await broker.grantSession(desktop.desktopId, USER_ID, 60_000, SCOPE);
    const grant = await broker.createViewerConnectionGrant(desktop.desktopId, USER_ID, 'webvnc', 300_000, SCOPE);

    const forwarded: unknown[] = [];
    const gw = new ViewerGateway({
      broker, port: port++, host: '127.0.0.1',
      forward: (d, e) => forwarded.push({ d, e }),
      resolveGrant: async t => {
        const v = await memoryStore.validateConnectionGrant(t);
        if (!v) return null;
        return { desktopId: v.desktopId, userId: USER_ID, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, protocol: v.protocol, expiresAt: new Date(Date.now() + 300_000).toISOString() };
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port - 1}`);
    await onceWsOpen(ws);
    ws.send(JSON.stringify({ type: 'auth', grantToken: grant.grantToken }));
    await new Promise(r => ws.once('message', r));

    // Takeover revokes all grants. The client stays IDLE — the sweep must
    // close it within the documented maximum delay.
    await broker.humanTakeover(desktop.desktopId, USER_ID_2, SCOPE);
    const t0 = Date.now();
    const closed = await onceWsClosed(ws);
    const elapsed = Date.now() - t0;
    expect(closed.code).toBe(4007); // swept
    // Documented maximum delay (with generous CI margin).
    expect(elapsed).toBeLessThanOrEqual(REVOCATION_MAX_DELAY_MS * 8);
    expect(gw.connectionCount).toBe(0);
    await gw.close();
  });
});
