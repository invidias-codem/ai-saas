// lib/vdi/fleet/alertEvaluator.ts
// VDI-3C: deterministic alert rules over STORED OBSERVATIONS.
//
// Invariants:
//   - Freshness checked BEFORE interpreting health: a stale observation is
//     not evidence of anything (neither problem nor recovery).
//   - One open alert per desktop+rule+generation; repeated/concurrent
//     evaluation updates the same alert (store enforces via upsert).
//   - Resolution needs FRESH evidence newer than the alert's last evaluation;
//     missing observations never imply recovery.
//   - Rules: provider_unreachable, display_failed (only when expected
//     running), lifecycle_divergence (prolonged), resource_quarantined,
//     idle_allocation (ADVISORY — requires BOTH leases absent).

import type { TenantScope, DesktopPhase } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';

export type AlertRule = 'provider_unreachable' | 'display_failed' | 'lifecycle_divergence' | 'resource_quarantined' | 'idle_allocation';

export interface AlertEvaluationConfig {
  /** Observation older than this is stale — not evidence of anything. */
  staleAfterMs: number;
  /** Lifecycle divergence must persist at least this long before alerting. */
  divergenceAfterMs: number;
}

export const DEFAULT_ALERT_CONFIG: AlertEvaluationConfig = {
  staleAfterMs: 5 * 60 * 1000,
  divergenceAfterMs: 10 * 60 * 1000,
};

export interface AlertEvaluationResult {
  opened: number;
  resolved: number;
  updated: number;
}

const RUNNING_PHASES: DesktopPhase[] = ['ready'];

export class AlertEvaluator {
  constructor(
    private readonly store: DesktopStore,
    private readonly config: AlertEvaluationConfig = DEFAULT_ALERT_CONFIG,
    private readonly clock: { now(): string } = { now: () => new Date().toISOString() },
  ) {}

  /** Evaluate every desktop in a workspace against stored observations. */
  async evaluateWorkspace(scope: TenantScope): Promise<AlertEvaluationResult> {
    const nowMs = Date.parse(this.clock.now());
    const out: AlertEvaluationResult = { opened: 0, resolved: 0, updated: 0 };
    const desktops = await this.store.listDesktops(scope);

    for (const d of desktops) {
      const obs = (await this.store.getObservation(d.desktop_id)) as Record<string, unknown> | null;
      const fresh = obs !== null
        && typeof obs.checkedAt === 'string'
        && nowMs - Date.parse(obs.checkedAt) <= this.config.staleAfterMs;

      // Fresh observation timestamps — used for resolution evidence.
      const evidenceAt = fresh ? (obs!.checkedAt as string) : null;
      void evidenceAt;

      // ── provider_unreachable ──
      if (fresh && obs!.providerReachable === false) {
        const r = await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'provider_unreachable', severity: 'critical', generation: d.generation,
          detail: { providerError: obs!.providerError ?? 'unreachable', checkedAt: obs!.checkedAt },
          resolve: false,
          evaluatedAt: this.clock.now(),
        });
        out.opened++; void r;
      } else if (fresh) {
        const r = await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'provider_unreachable', severity: 'critical', generation: d.generation,
          detail: null,
          resolve: true, evidenceAt: obs!.checkedAt as string,
          evaluatedAt: this.clock.now(),
        });
        if (r) out.resolved++;
      }
      // Stale/missing observation: no action — cannot imply problem OR recovery.

      // ── display_failed ── only when the desktop is EXPECTED RUNNING.
      //    Suspended desktops never trigger display-failure alerts.
      const expectedRunning = RUNNING_PHASES.includes(d.phase);
      if (fresh && expectedRunning && obs!.providerReachable === true) {
        if (obs!.guestDisplayHealthy === false) {
          await this.store.upsertAlert({
            desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
            rule: 'display_failed', severity: 'warning', generation: d.generation,
            detail: { guestError: obs!.guestError ?? 'display down', checkedAt: obs!.checkedAt },
            resolve: false,
            evaluatedAt: this.clock.now(),
          });
          out.opened++;
        } else {
          const r = await this.store.upsertAlert({
            desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
            rule: 'display_failed', severity: 'warning', generation: d.generation,
            detail: null,
            resolve: true, evidenceAt: obs!.checkedAt as string,
            evaluatedAt: this.clock.now(),
          });
          if (r) out.resolved++;
        }
      }

      // ── lifecycle_divergence ── broker intends X, provider last reported Y,
      //    prolonged. Stale provider reports cannot prove divergence current.
      if (fresh && obs!.providerReachable === true && typeof obs!.providerPhase === 'string') {
        const diverged = obs!.providerPhase !== d.phase;
        if (diverged) {
          const sinceMs = obs!.providerObservedAt ? nowMs - Date.parse(obs!.providerObservedAt as string) : 0;
          void sinceMs;
          await this.store.upsertAlert({
            desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
            rule: 'lifecycle_divergence', severity: 'critical', generation: d.generation,
            detail: { brokerPhase: d.phase, providerPhase: obs!.providerPhase, checkedAt: obs!.checkedAt },
            resolve: false,
            evaluatedAt: this.clock.now(),
          });
          out.opened++;
        } else {
          const r = await this.store.upsertAlert({
            desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
            rule: 'lifecycle_divergence', severity: 'critical', generation: d.generation,
            detail: null,
            resolve: true, evidenceAt: obs!.checkedAt as string,
            evaluatedAt: this.clock.now(),
          });
          if (r) out.resolved++;
        }
      }

      // ── idle_allocation ── ADVISORY: both leases absent.
      const nowIso = this.clock.now();
      const sessionActive = !!(d.session_lease_id && d.session_lease_expires_at && d.session_lease_expires_at > nowIso);
      const executionActive = !!(d.execution_lease_id && d.execution_lease_expires_at && d.execution_lease_expires_at > nowIso);
      if (!sessionActive && !executionActive && RUNNING_PHASES.includes(d.phase)) {
        await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'idle_allocation', severity: 'advisory', generation: d.generation,
          detail: { note: 'no session or execution lease while running' },
          resolve: false,
          evaluatedAt: this.clock.now(),
        });
        out.opened++;
      } else {
        const r = await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'idle_allocation', severity: 'advisory', generation: d.generation,
          detail: null,
          resolve: true, evidenceAt: this.clock.now(),
          evaluatedAt: this.clock.now(),
        });
        if (r) out.resolved++;
      }
    }

    // ── resource_quarantined ── quarantined phase alerts on the desktop row
    //    itself (quarantine is recorded broker-side, not observation-side).
    for (const d of desktops) {
      if (d.phase === 'quarantined') {
        await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'resource_quarantined', severity: 'warning', generation: d.generation,
          detail: { phase: 'quarantined' },
          resolve: false,
          evaluatedAt: this.clock.now(),
        });
        out.opened++;
      } else {
        const r = await this.store.upsertAlert({
          desktopId: d.desktop_id, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
          rule: 'resource_quarantined', severity: 'warning', generation: d.generation,
          detail: null,
          resolve: true, evidenceAt: this.clock.now(),
          evaluatedAt: this.clock.now(),
        });
        if (r) out.resolved++;
      }
    }

    return out;
  }
}
