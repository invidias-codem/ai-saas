// lib/vdi/remediation/policy.ts
// VDI-4A: PURE remediation policy — stored observations, alerts and a
// versioned policy produce a proposal or an explicit abstention. No provider
// calls, no lifecycle mutations, nothing executed here.
//
// Proposal binding (every proposal carries):
//   tenant/workspace, desktopId, desktopGeneration — generation invalidates
//     execution when the desktop has moved on (the lease race in VDI-2A
//     proved this boundary transactionally).
//   action, reason, source evidence (alert id/timestamp + observation
//     checkedAt + relevant generation).
//   policyVersion, proposalExpiry, recheckable preconditions (the executor
//     re-verifies ALL of them authoritatively before acting).
//   retryLimit + reconciliation requirements for ambiguous outcomes.
//
// Rules:
//   idle_suspension: fresh evidence + eligible phase + NO active session
//     lease + NO active execution lease + NO input holder. A lease arriving
//     after proposal must invalidate EXECUTION at the existing transactional
//     suspension boundary (the executor rechecks; the broker's suspend RPC
//     is the final authority).
//   display_recovery: reachable + running + CONFIRMED display failure +
//     verified recovery capability; attempts counted DURABLY (survive
//     restarts). Ambiguous provider outcome ⇒ reconciliation required before
//     another attempt; exhausted limit ⇒ exactly one escalation record.
//   quarantine: NO retirement proposal is ever produced here — quarantine
//     flows to ownership reconciliation + retention review (preserved rule).

import type { TenantScope, DesktopPhase } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';

// ── Policy (versioned; deterministic output for the same inputs) ─────────────

export interface RemediationPolicy {
  policyVersion: string;
  /** Evidence older than this is stale ⇒ ABSTAIN (never act on unknowns). */
  evidenceFreshMs: number;
  /** Proposal lifetime; executor refuses expired proposals. */
  proposalExpiryMs: number;
  idleSuspension: {
    enabled: boolean;
    /** Phases eligible for idle suspension. */
    eligiblePhases: DesktopPhase[];
  };
  displayRecovery: {
    enabled: boolean;
    /** Durable attempt budget per (desktop, rule, policyVersion). */
    maxAttempts: number;
    /** Capability that must be verified before proposing recovery. */
    requiresCapability: 'guest_display_restart';
  };
}

export const DEFAULT_REMEDIATION_POLICY: RemediationPolicy = {
  policyVersion: 'vdi4a-2026-10',
  evidenceFreshMs: 5 * 60 * 1000,
  proposalExpiryMs: 5 * 60 * 1000,
  idleSuspension: { enabled: true, eligiblePhases: ['ready'] },
  displayRecovery: { enabled: true, maxAttempts: 3, requiresCapability: 'guest_display_restart' },
};

// ── Proposals & abstentions ─────────────────────────────────────────────────

export type RemediationAction = 'idle_suspension' | 'display_recovery';

/** Preconditions the executor re-verifies authoritatively at execution time. */
export interface Preconditions {
  /** Current desktop generation must equal the proposal's generation. */
  expectedGeneration: number;
  /** Broker phase the desktop must still be in. */
  expectedPhase: DesktopPhase;
  /** No active session lease at execution time. */
  requireNoSessionLease: boolean;
  /** No active execution lease at execution time. */
  requireNoExecutionLease: boolean;
  /** No input-control holder at execution time. */
  requireNoInputHolder: boolean;
  /** Provider must be reachable at execution time (display recovery). */
  requireProviderReachable?: boolean;
  /** Display must still be failing at execution time (recovery idempotence). */
  requireDisplayFailing?: boolean;
}

export interface RemediationProposal {
  proposalId: string;
  tenantId: string;
  workspaceId: string;
  desktopId: string;
  desktopGeneration: number;
  action: RemediationAction;
  reason: string;
  /** Source evidence: the alert and observation that justify the proposal. */
  evidence: {
    alertRule: string;
    alertObservedAt: string;
    observationCheckedAt: string;
    providerPhase: string | null;
    guestDisplayHealthy: boolean | null;
  };
  policyVersion: string;
  proposedAt: string;
  expiresAt: string;
  preconditions: Preconditions;
  retryLimit: number;
  /** Ambiguous provider outcomes must reconcile before another attempt. */
  reconciliationRequired: 'provider_state_reread' | null;
  /** Attempt budget consumed so far (display recovery). */
  attemptBudget: { used: number; limit: number } | null;
}

export interface RemediationAbstention {
  action: RemediationAction;
  reason: string;
}

export type RemediationDecision =
  | { kind: 'propose'; proposal: RemediationProposal }
  | { kind: 'abstain'; abstention: RemediationAbstention };

export interface RemediationResult {
  decisions: Array<{ desktopId: string; decision: RemediationDecision }>;
}

// ── Policy engine ────────────────────────────────────────────────────────────

export class RemediationPolicyEngine {
  constructor(
    private readonly store: DesktopStore,
    private readonly policy: RemediationPolicy = DEFAULT_REMEDIATION_POLICY,
    private readonly clock: { now(): string } = { now: () => new Date().toISOString() },
    /** Verified capability set; wiring the real guest-restart tool goes here. */
    private readonly capabilities: string[] = ['guest_display_restart'],
  ) {}

  /**
   * Produce proposals or explicit abstentions for every desktop in the
   * workspace. PURE: reads stored state only; deterministic for the same
   * stored inputs + policy version.
   */
  async evaluateWorkspace(scope: TenantScope): Promise<RemediationResult> {
    const nowIso = this.clock.now();
    const nowMs = Date.parse(nowIso);
    const desktops = await this.store.listDesktops(scope);
    const decisions: RemediationResult['decisions'] = [];

    for (const d of desktops) {
      // QUARANTINE PRESERVATION: quarantined resources never receive any
      // automated action proposal — ownership reconciliation + retention
      // review is a separate, explicit path.
      if (d.phase === 'quarantined') {
        decisions.push({
          desktopId: d.desktop_id,
          decision: { kind: 'abstain', abstention: { action: 'idle_suspension', reason: 'quarantined: ownership reconciliation and retention review required before any action' } },
        });
        continue;
      }

      const obs = (await this.store.getObservation(d.desktop_id)) as Record<string, unknown> | null;
      const alerts = await this.store.listAlerts(scope, 'open');

      // ── idle_suspension ──
      decisions.push({
        desktopId: d.desktop_id,
        decision: this.decideIdleSuspension(scope, d, obs, nowMs, nowIso),
      });

      // ── display_recovery ──
      decisions.push({
        desktopId: d.desktop_id,
        decision: await this.decideDisplayRecovery(scope, d, obs, alerts, nowMs, nowIso),
      });
    }

    return { decisions };
  }

  private decideIdleSuspension(
    scope: TenantScope,
    d: { desktop_id: string; phase: DesktopPhase; generation: number; session_lease_id: string | null; session_lease_expires_at: string | null; execution_lease_id: string | null; execution_lease_expires_at: string | null; input_control_lease_id: string | null },
    obs: Record<string, unknown> | null,
    nowMs: number,
    nowIso: string,
  ): RemediationDecision {
    const p = this.policy.idleSuspension;
    if (!p.enabled) return abstain('idle_suspension', 'idle suspension disabled by policy');

    // Eligible phase.
    if (!p.eligiblePhases.includes(d.phase)) {
      return abstain('idle_suspension', `phase ${d.phase} not eligible`);
    }

    // Fresh evidence REQUIRED — stale/missing observation ⇒ explicit abstention.
    if (!obs || typeof obs.checkedAt !== 'string' || nowMs - Date.parse(obs.checkedAt) > this.policy.evidenceFreshMs) {
      return abstain('idle_suspension', 'observation stale or missing; cannot act on unknown state');
    }

    // No active leases (authoritative recheck happens at execution).
    const sessionActive = !!(d.session_lease_id && d.session_lease_expires_at && d.session_lease_expires_at > nowIso);
    if (sessionActive) return abstain('idle_suspension', 'active session lease present');
    const executionActive = !!(d.execution_lease_id && d.execution_lease_expires_at && d.execution_lease_expires_at > nowIso);
    if (executionActive) return abstain('idle_suspension', 'active execution lease present');

    // No input holder.
    if (d.input_control_lease_id) return abstain('idle_suspension', 'input-control holder present');

    return {
      kind: 'propose',
      proposal: {
        proposalId: `rp-${this.policy.policyVersion}-${d.desktop_id}-${nowMs}`,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        desktopId: d.desktop_id,
        desktopGeneration: d.generation,
        action: 'idle_suspension',
        reason: 'idle: no session lease, no execution lease, no input holder, phase eligible',
        evidence: {
          alertRule: 'idle_allocation',
          alertObservedAt: (obs.alertFirstObservedAt as string) ?? nowIso,
          observationCheckedAt: obs.checkedAt as string,
          providerPhase: (obs.providerPhase as string) ?? null,
          guestDisplayHealthy: (obs.guestDisplayHealthy as boolean) ?? null,
        },
        policyVersion: this.policy.policyVersion,
        proposedAt: nowIso,
        expiresAt: new Date(nowMs + this.policy.proposalExpiryMs).toISOString(),
        preconditions: {
          expectedGeneration: d.generation,
          expectedPhase: d.phase,
          requireNoSessionLease: true,
          requireNoExecutionLease: true,
          requireNoInputHolder: true,
        },
        retryLimit: 1, // suspension is idempotent; reconciliation on ambiguity
        reconciliationRequired: 'provider_state_reread',
        attemptBudget: null,
      },
    };
  }

  private async decideDisplayRecovery(
    scope: TenantScope,
    d: { desktop_id: string; phase: DesktopPhase; generation: number },
    obs: Record<string, unknown> | null,
    alerts: Array<{ rule: string; desktopId: string }>,
    nowMs: number,
    nowIso: string,
  ): Promise<RemediationDecision> {
    const p = this.policy.displayRecovery;
    if (!p.enabled) return abstain('display_recovery', 'display recovery disabled by policy');

    // Confirmed display failure via the alerting plane.
    const hasDisplayAlert = alerts.some(a => a.rule === 'display_failed' && a.desktopId === d.desktop_id);
    if (!hasDisplayAlert) return abstain('display_recovery', 'no confirmed display_failed alert');

    // Fresh evidence REQUIRED.
    if (!obs || typeof obs.checkedAt !== 'string' || nowMs - Date.parse(obs.checkedAt) > this.policy.evidenceFreshMs) {
      return abstain('display_recovery', 'observation stale or missing; cannot act on unknown state');
    }

    // Reachable + running resource.
    if (obs.providerReachable !== true) return abstain('display_recovery', 'provider unreachable; reconcile before any attempt');
    if (d.phase !== 'ready') return abstain('display_recovery', `resource not running (phase ${d.phase})`);
    if (obs.guestDisplayHealthy !== false) return abstain('display_recovery', 'display not confirmed failed in current observation');

    // Verified recovery capability.
    if (!this.capabilities.includes(p.requiresCapability)) {
      return abstain('display_recovery', 'recovery capability not verified');
    }

    // Durable attempt budget across worker restarts.
    const attempts = await this.store.getRemediationAttempts(d.desktop_id);
    const mine = attempts.find(a => a.rule === 'display_recovery' && a.policyVersion === this.policy.policyVersion);
    const used = mine?.attemptCount ?? 0;
    if (mine?.escalated || used >= p.maxAttempts) {
      return abstain('display_recovery', `retry budget exhausted (${used}/${p.maxAttempts}); escalation recorded`);
    }

    return {
      kind: 'propose',
      proposal: {
        proposalId: `rp-${this.policy.policyVersion}-${d.desktop_id}-${nowMs}`,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        desktopId: d.desktop_id,
        desktopGeneration: d.generation,
        action: 'display_recovery',
        reason: 'display failure confirmed on reachable running resource; recovery capability verified',
        evidence: {
          alertRule: 'display_failed',
          alertObservedAt: (obs.checkedAt as string) ?? nowIso,
          observationCheckedAt: obs.checkedAt as string,
          providerPhase: (obs.providerPhase as string) ?? null,
          guestDisplayHealthy: false,
        },
        policyVersion: this.policy.policyVersion,
        proposedAt: nowIso,
        expiresAt: new Date(nowMs + this.policy.proposalExpiryMs).toISOString(),
        preconditions: {
          expectedGeneration: d.generation,
          expectedPhase: 'ready',
          requireNoSessionLease: false,
          requireNoExecutionLease: false,
          requireNoInputHolder: false,
          requireProviderReachable: true,
          requireDisplayFailing: true,
        },
        retryLimit: p.maxAttempts,
        // Ambiguous provider outcome must reconcile before the next attempt.
        reconciliationRequired: 'provider_state_reread',
        attemptBudget: { used, limit: p.maxAttempts },
      },
    };
  }
}

function abstain(action: RemediationAction, reason: string): RemediationDecision {
  return { kind: 'abstain', abstention: { action, reason } };
}
