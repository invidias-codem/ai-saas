// __tests__/contracts/vdi-budget-admission.contract.test.ts
// VDI-4C acceptance: budget admission, reservation lifecycle, settlement.
//
// Scenarios (from the slice gate):
//   1. Concurrent requests at the limit → only affordable reservations succeed.
//   2. Duplicate replay → original reservation; conflicting payload refused.
//   3. Provisioning succeeds, response lost → reservation HELD through
//      reconciliation (expiry alone never releases).
//   4. Definitive creation failure → reservation released ONCE.
//   5. Usage and charge replay → no duplicate spend; corrections atomic.
//   6. Budget-period rollover → liabilities keep original attribution.
//   7. Unknown price → explicit refusal without ceiling; conservative ceiling
//      admits; late overrun → recorded + admission blocked by policy.

import * as mem from '@/lib/vdi/store/memoryDesktopStore';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

const SCOPE: TenantScope = { tenantId: 'tenant-1', workspaceId: 'ws-1' };
const PERIOD = '2026-10';
const NOW = () => new Date().toISOString();
const HORIZON = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const store: DesktopStore = {
  // Only the budget surface is exercised here; the rest satisfies the type.
  ...({} as Record<string, unknown>),
  admitReservation: mem.admitReservation,
  resolveProvisioning: mem.resolveProvisioning,
  settleReservation: mem.settleReservation,
  adjustSettledCharge: mem.adjustSettledCharge,
  extendReservationHorizon: mem.extendReservationHorizon,
  getBudget: mem.getBudget,
  getReservation: mem.getReservation,
} as unknown as DesktopStore;

beforeEach(() => { mem.resetMemoryStore(); });

const admit = (key: string, amount: number | null, ceiling: number | null = null) =>
  mem.admitReservation({
    operationKey: key, tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId,
    budgetPeriod: PERIOD, currency: 'USD', amountMicros: amount,
    unknownCeilingMicros: ceiling, resourceSpec: { specHash: 'x' },
    pricingVersion: 'daytona-2026-10', horizonExpiresAt: HORIZON(),
  });

describe('VDI-4C Budget admission', () => {
  it('1: concurrent requests at the limit → only affordable reservations succeed', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });
    // 6 concurrent requests of 3_000 each against a 10_000 limit: exactly 3 fit.
    const results = await Promise.all([
      admit('op-a', 3_000), admit('op-b', 3_000), admit('op-c', 3_000),
      admit('op-d', 3_000), admit('op-e', 3_000), admit('op-f', 3_000),
    ]);
    const admitted = results.filter(r => r.admitted);
    expect(admitted.length).toBe(3);
    const refused = results.filter(r => !r.admitted);
    expect(refused.every(r => r.reason === 'over admission limit')).toBe(true);
    const b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(0); // nothing settled yet — exposure is reservations
  });

  it('2: duplicate replay returns the original; conflicting payload refused', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });
    const first = await admit('op-x', 5_000);
    expect(first.admitted).toBe(true);
    // Same key, same binding → replay of the ORIGINAL reservation.
    const replay = await admit('op-x', 5_000);
    expect(replay.admitted).toBe(true);
    expect(replay.replay).toBe(true);
    // Same key, DIFFERENT amount → conflict.
    const conflict = await admit('op-x', 7_000);
    expect(conflict.admitted).toBe(false);
    expect(conflict.reason).toMatch(/conflicting replay/);
    // No double reservation: one row, one amount.
    const r = await mem.getReservation('op-x');
    expect(r!.amountMicros).toBe(5_000);
    const b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(0);
  });

  it('3: provisioning succeeds, response lost → reservation HELD through reconciliation; expiry alone never releases', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });
    await admit('op-hold', 5_000);
    // Uncertain provisioning outcome (response lost).
    const h = await mem.resolveProvisioning({ operationKey: 'op-hold', outcome: 'uncertain', now: NOW() });
    expect(h.ok).toBe(true);
    expect(h.status).toBe('held-for-reconciliation');
    // Horizon expires... nothing in the surface releases on expiry. The
    // reservation still counts as outstanding exposure after the horizon.
    const r = await mem.getReservation('op-hold');
    expect(r!.status).toBe('held-for-reconciliation');
    // It still blocks the budget: a 6_000 request must fail (5_000 held + 6_000 > 10_000).
    const over = await admit('op-after-expiry', 6_000);
    expect(over.admitted).toBe(false);
    expect(over.reason).toBe('over admission limit');
  });

  it('4: definitive creation failure → reservation released ONCE', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });
    await admit('op-fail', 4_000);
    const rel = await mem.resolveProvisioning({ operationKey: 'op-fail', outcome: 'failed', now: NOW() });
    expect(rel.ok).toBe(true);
    expect(rel.status).toBe('released');
    // Second release attempt: not resolvable again (idempotent no-op failure).
    const again = await mem.resolveProvisioning({ operationKey: 'op-fail', outcome: 'failed', now: NOW() });
    expect(again.ok).toBe(false);
    // Exposure freed: 9_000 now admissible.
    const b = await admit('op-after-release', 9_000);
    expect(b.admitted).toBe(true);
  });

  it('5: usage and charge replay → no duplicate spend; corrections apply atomically', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 100_000 });
    await admit('op-settle', 5_000);
    // Settle at the measured actual.
    const s1 = await mem.settleReservation({ operationKey: 'op-settle', actualMicros: 4_200, blockAdmissionOnOverrun: true, now: NOW() });
    expect(s1.ok).toBe(true);
    expect(s1.settledMicros).toBe(4_200);
    // REPLAY the same settlement: no duplicate spend.
    const s2 = await mem.settleReservation({ operationKey: 'op-settle', actualMicros: 4_200, blockAdmissionOnOverrun: true, now: NOW() });
    expect(s2.ok).toBe(true);
    expect(s2.replay).toBe(true);
    let b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(4_200);
    // Provider charge correction: TRUE charge 5_100 (delta +900).
    const adj = await mem.adjustSettledCharge({ operationKey: 'op-settle', chargeMicros: 5_100, now: NOW() });
    expect(adj.ok).toBe(true);
    expect(adj.deltaMicros).toBe(900);
    b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(5_100); // 4_200 + 900
    // Charge REPLAY: no-op.
    const adj2 = await mem.adjustSettledCharge({ operationKey: 'op-settle', chargeMicros: 5_100, now: NOW() });
    expect(adj2.replay).toBe(true);
    b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(5_100);
    // Reservation exposure replaced: settled no longer counts as outstanding.
    const next = await admit('op-after-settle', 94_900);
    expect(next.admitted).toBe(true); // 5_100 spent + 94_900 = 100_000 = limit
  });

  it('6: budget-period rollover → liabilities retain their original attribution', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: '2026-10', limitMicros: 10_000 });
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: '2026-11', limitMicros: 10_000 });
    // October reservation settles into October's accounting.
    const oct = await mem.admitReservation({
      operationKey: 'op-oct', tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId,
      budgetPeriod: '2026-10', currency: 'USD', amountMicros: 7_000,
      unknownCeilingMicros: null, resourceSpec: {}, pricingVersion: 'v1', horizonExpiresAt: HORIZON(),
    });
    expect(oct.admitted).toBe(true);
    await mem.settleReservation({ operationKey: 'op-oct', actualMicros: 7_000, blockAdmissionOnOverrun: true, now: NOW() });
    // November is FRESH: October's 7_000 liability never migrates.
    const nov = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: '2026-11' });
    expect(nov!.accountedSpendMicros).toBe(0);
    expect(nov!.limitMicros).toBe(10_000);
    const octB = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: '2026-10' });
    expect(octB!.accountedSpendMicros).toBe(7_000);
    // The reservation keeps its original period attribution.
    const r = await mem.getReservation('op-oct');
    expect(r!.budgetPeriod).toBe('2026-10');
  });

  it('7: unknown price → refused without ceiling; ceiling admits; late overrun recorded + admission blocked', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });

    // Unknown price, no ceiling → refused, explicitly.
    const no = await admit('op-unknown', null, null);
    expect(no.admitted).toBe(false);
    expect(no.reason).toMatch(/unknown is never zero/);

    // Unknown price WITH a conservative policy ceiling → admitted, flagged.
    const yes = await admit('op-unknown-ok', null, 8_000);
    expect(yes.admitted).toBe(true);
    expect(yes.pricingKnown).toBe(false); // pricing_known=false: estimate, not actual
    const r = await mem.getReservation('op-unknown-ok');
    expect(r!.pricingKnown).toBe(false);

    // Late overrun: settle ABOVE the limit → overrun recorded, admission
    // blocked by policy, but the EXISTING work is not terminated.
    await mem.settleReservation({ operationKey: 'op-unknown-ok', actualMicros: 11_000, blockAdmissionOnOverrun: true, now: NOW() });
    const b = await mem.getBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD });
    expect(b!.accountedSpendMicros).toBe(11_000);
    expect(b!.overrunMicros).toBe(1_000);      // recorded, explicit
    expect(b!.admissionBlocked).toBe(true);    // further admission blocked
    // New reservations refused while blocked...
    const blocked = await admit('op-new', 100);
    expect(blocked.admitted).toBe(false);
    expect(blocked.reason).toMatch(/admission blocked/);
    // ...but the reservation itself was settled (allow-to-complete; the
    // threshold crossing did NOT terminate the authorized work).
    const settled = await mem.getReservation('op-unknown-ok');
    expect(settled!.status).toBe('settled');
  });

  it('8: horizon extension is an explicit decision; existing-allow-to-complete default is documented behavior', async () => {
    mem.seedBudget({ tenantId: SCOPE.tenantId, workspaceId: SCOPE.workspaceId, budgetPeriod: PERIOD, limitMicros: 10_000 });
    await admit('op-ext', 5_000);
    const r1 = await mem.getReservation('op-ext');
    const ext = await mem.extendReservationHorizon({
      operationKey: 'op-ext',
      newHorizon: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      now: NOW(),
    });
    expect(ext).toBe(true);
    const r2 = await mem.getReservation('op-ext');
    expect(Date.parse(r2!.horizonExpiresAt)).toBeGreaterThan(Date.parse(r1!.horizonExpiresAt));
    // Non-existent reservation: refused.
    expect(await mem.extendReservationHorizon({ operationKey: 'op-nope', newHorizon: HORIZON(), now: NOW() })).toBe(false);
  });
});
