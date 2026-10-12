// lib/vdi/remediation/executor.ts
// VDI-4B: Durable remediation executor.
//
// Execution rules (locked):
//   - Persist the proposal binding + atomically CLAIM the operation key:
//     one dispatch owner; stale workers cannot update the operation.
//   - Before dispatch, recheck ALL preconditions authoritatively: ownership
//     (scoped store read), generation, policy version, proposal expiry,
//     evidence freshness, and action-specific conditions (leases for
//     suspension; provider reachability + display state for recovery).
//   - Attempt budget consumed at DISPATCH ADMISSION (inside the claim),
//     never at proposal time, never on duplicate delivery.
//   - Uncertain outcomes persist 'reconciling' and inspect authoritative
//     provider state before deciding whether another attempt is safe.
//   - Terminal outcomes (success/refused/exhausted) carry outcome evidence;
//     writes are replay-safe (terminal states immutable; same-outcome
//     replays are no-ops; evidence-write failure retries without re-dispatch).
//   - Suspension reuses the broker's EXISTING transactional boundary.
//   - Display recovery reconciliation contract: a healthy display proves the
//     desired outcome; an unhealthy display alone proves NOTHING about whether
//     the restart executed — if the adapter cannot resolve that, status stays
//     'unresolved' (explicit), never a false success or a blind retry.

import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';
import type { RemediationProposal } from '@/lib/vdi/remediation/policy';
import type { DurableDesktopBroker } from '@/lib/vdi/broker/desktopBroker';

export interface ExecutorDeps {
  store: DesktopStore;
  broker: DurableDesktopBroker;
  /** Provider re-read for reconciliation (authoritative state). */
  provider: {
    getDesktopState(providerId: string, scope: TenantScope): Promise<{ phase: string; resumeKey?: string } | null>;
  };
  /** Guest/display probe for reconciliation. */
  guest: {
    checkDisplay(desktopId: string, providerId: string, scope: TenantScope): Promise<{ healthy: boolean; error?: string } | null>;
  };
  clock: { now(): string };
  evidenceFreshMs: number;
}

export interface ExecutionOutcome {
  operationKey: string;
  status: 'success' | 'refused' | 'exhausted' | 'reconciling' | 'unresolved';
  refusalReason?: string;
  dispatched: boolean;
  evidence: Record<string, unknown>;
}

/** Stable operation key per proposal binding. */
export function remediationOperationKey(p: RemediationProposal): string {
  return `vdi:rem:${p.action}:${p.desktopId}:${p.desktopGeneration}:${p.policyVersion}`;
}

export class RemediationExecutor {
  constructor(private readonly deps: ExecutorDeps) {}

  /**
   * Execute one proposal. The ONLY path to provider action. Returns a
   * terminal or explicit-uncertain outcome; never throws for control flow.
   */
  async execute(proposal: RemediationProposal, workerId: string): Promise<ExecutionOutcome> {
    const scope: TenantScope = { tenantId: proposal.tenantId, workspaceId: proposal.workspaceId };
    const operationKey = remediationOperationKey(proposal);
    const nowIso = this.deps.clock.now();
    const nowMs = Date.parse(nowIso);

    // ── 1. Rechecks BEFORE claiming (cheap, non-mutating) ─────────────────────
    const pre = await this.recheck(proposal, scope, nowMs, nowIso);
    if (pre !== null) {
      return { operationKey, status: 'refused', refusalReason: pre, dispatched: false, evidence: { refusedAt: nowIso, reason: pre } };
    }

    // ── 2. Atomic claim: one owner; budget consumed HERE (admission) ─────────
    const attemptRule = proposal.action === 'display_recovery' ? 'display_recovery' : 'idle_suspension';
    const claim = await this.deps.store.claimRemediationOperation({
      operationKey,
      tenantId: proposal.tenantId, workspaceId: proposal.workspaceId,
      desktopId: proposal.desktopId, desktopGeneration: proposal.desktopGeneration,
      action: proposal.action, reason: proposal.reason,
      proposal: proposal as unknown as Record<string, unknown>,
      policyVersion: proposal.policyVersion,
      proposedAt: proposal.proposedAt, expiresAt: proposal.expiresAt,
      workerId,
      attemptLimit: proposal.retryLimit,
      attemptRule,
    });

    if (!claim.claimed) {
      // Another worker owns it (or budget exhausted). NO provider action,
      // NO budget consumption on our side — duplicate delivery is inert.
      return {
        operationKey,
        status: claim.status === 'exhausted' ? 'exhausted' : 'refused',
        refusalReason: claim.status === 'exhausted'
          ? 'attempt budget exhausted'
          : `operation owned by ${claim.owner ?? 'another worker'} (status ${claim.status})`,
        dispatched: false,
        evidence: { claimConflict: claim },
      };
    }

    // ── 3. Authoritative recheck AFTER claiming (state may have moved
    //       between proposal and claim). Refusals keep the claim as evidence. ─
    const post = await this.recheck(proposal, scope, nowMs, nowIso);
    if (post !== null) {
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'refused',
        outcomeEvidence: { refusedAt: nowIso, reason: post, attemptNumber: claim.attemptNumber },
        refusalReason: post,
      });
      return { operationKey, status: 'refused', refusalReason: post, dispatched: false, evidence: { reason: post } };
    }

    // ── 4. Dispatch ───────────────────────────────────────────────────────────
    await this.deps.store.updateRemediationOperation({
      operationKey, workerId, newStatus: 'dispatched',
      outcomeEvidence: { dispatchedAt: nowIso, attemptNumber: claim.attemptNumber },
    });

    // ── 5. Action + outcome ─────────────────────────────────────────────────
    if (proposal.action === 'idle_suspension') {
      return this.executeSuspension(proposal, scope, operationKey, workerId, nowIso);
    }
    return this.executeDisplayRecovery(proposal, scope, operationKey, workerId, nowIso);
  }

  /**
   * Preconditions rechecked authoritatively against CURRENT state (not the
   * proposal's snapshot). Returns a refusal reason or null when all pass.
   */
  private async recheck(p: RemediationProposal, scope: TenantScope, nowMs: number, nowIso: string): Promise<string | null> {
    // Ownership: the desktop must exist in the proposal's scope (foreign or
    // absent desktops refuse — no existence leak).
    const d = await this.deps.store.getDesktopById(p.desktopId, scope);
    if (!d) return 'desktop not found in proposal scope (ownership)';

    // Lease preconditions FIRST (the operative safety check): a lease arriving
    // after proposal must be detected as such, even though granting it also
    // advanced the generation. Lease presence is the more specific refusal.
    if (p.action === 'idle_suspension') {
      if (p.preconditions.requireNoSessionLease) {
        const sessionActive = !!(d.session_lease_id && d.session_lease_expires_at && d.session_lease_expires_at > nowIso);
        if (sessionActive) return 'active session lease present';
      }
      if (p.preconditions.requireNoExecutionLease) {
        const execActive = !!(d.execution_lease_id && d.execution_lease_expires_at && d.execution_lease_expires_at > nowIso);
        if (execActive) return 'active execution lease present';
      }
      if (p.preconditions.requireNoInputHolder && d.input_control_lease_id) {
        return 'input-control holder present';
      }
    }

    // Generation: the desktop must not have moved on.
    if (d.generation !== p.desktopGeneration) {
      return `generation changed: proposal ${p.desktopGeneration}, current ${d.generation}`;
    }

    // Proposal expiry.
    if (nowMs > Date.parse(p.expiresAt)) return 'proposal expired';

    // Evidence freshness (the observation the proposal relied on).
    const obs = (await this.deps.store.getObservation(p.desktopId)) as Record<string, unknown> | null;
    if (!obs || typeof obs.checkedAt !== 'string' || nowMs - Date.parse(obs.checkedAt) > this.deps.evidenceFreshMs) {
      return 'evidence stale or missing';
    }

    // Phase.
    if (d.phase !== p.preconditions.expectedPhase) {
      return `phase is ${d.phase}, expected ${p.preconditions.expectedPhase}`;
    }

    // Display-recovery preconditions.
    if (p.action === 'display_recovery') {
      if (p.preconditions.requireProviderReachable && obs.providerReachable !== true) {
        return 'provider unreachable at execution time';
      }
      if (p.preconditions.requireDisplayFailing && obs.guestDisplayHealthy !== false) {
        return 'display no longer failing at execution time';
      }
    }
    return null;
  }

  /** Suspension reuses the broker's transactional boundary. */
  private async executeSuspension(
    p: RemediationProposal, scope: TenantScope, operationKey: string, workerId: string, nowIso: string,
  ): Promise<ExecutionOutcome> {
    try {
      // The broker's suspend is the lease-guarded transactional RPC path:
      // a lease arriving between recheck and dispatch refuses HERE.
      await this.deps.broker.suspend(p.desktopId, scope);
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'success',
        outcomeEvidence: { suspendedAt: nowIso, observedAt: nowIso, action: 'idle_suspension' },
      });
      return { operationKey, status: 'success', dispatched: true, evidence: { suspendedAt: nowIso } };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Lease conflicts are refusals; provider ambiguity requires reconciliation.
      if (/lease|phase|generation/i.test(msg)) {
        await this.deps.store.updateRemediationOperation({
          operationKey, workerId, newStatus: 'refused',
          outcomeEvidence: { refusedAt: nowIso, reason: msg }, refusalReason: msg,
        });
        return { operationKey, status: 'refused', refusalReason: msg, dispatched: false, evidence: { reason: msg } };
      }
      // Uncertain: provider state must be inspected before any retry.
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'reconciling',
        outcomeEvidence: { error: msg, at: nowIso },
      });
      return this.reconcileSuspension(p, scope, operationKey, workerId, nowIso, msg);
    }
  }

  /**
   * Lost-response reconciliation for suspension: read the AUTHORITATIVE
   * provider state. If the provider reports suspended, the action happened —
   * record success WITHOUT another suspend call. Otherwise unresolved
   * (explicit, never a blind retry).
   */
  private async reconcileSuspension(
    p: RemediationProposal, scope: TenantScope, operationKey: string, workerId: string, nowIso: string, error: string,
  ): Promise<ExecutionOutcome> {
    const d = await this.deps.store.getDesktopById(p.desktopId, scope);
    if (!d) {
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'unresolved',
        outcomeEvidence: { error, unresolvedAt: nowIso, note: 'desktop vanished during reconciliation' },
      });
      return { operationKey, status: 'unresolved', dispatched: true, evidence: { error, note: 'desktop vanished' } };
    }
    const providerState = await this.deps.provider.getDesktopState(d.provider_id, scope);
    if (providerState?.phase === 'suspended') {
      // The suspend happened before the response was lost — success, no repeat.
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'success',
        outcomeEvidence: { reconciledAt: nowIso, providerPhase: 'suspended', error },
      });
      // Mirror the authoritative provider state into the broker row so the
      // console reflects reality (phase transition through the store).
      await this.deps.store.updateDesktopPhase(p.desktopId, scope, 'suspended', d.generation).catch(() => {});
      return { operationKey, status: 'success', dispatched: true, evidence: { reconciledAt: nowIso, providerPhase: 'suspended' } };
    }
    await this.deps.store.updateRemediationOperation({
      operationKey, workerId, newStatus: 'unresolved',
      outcomeEvidence: { error, providerPhase: providerState?.phase ?? 'unknown', unresolvedAt: nowIso,
        note: 'provider state does not confirm suspension; ambiguous outcome retained explicitly' },
    });
    return { operationKey, status: 'unresolved', dispatched: true, evidence: { error, providerPhase: providerState?.phase ?? 'unknown' } };
  }

  /**
   * Display recovery. Reconciliation contract: after any attempt (including
   * a lost response), a HEALTHY display proves the desired outcome. An
   * unhealthy display alone proves nothing about whether the restart executed
   * — if the probe can't resolve it, status stays 'unresolved'.
   */
  private async executeDisplayRecovery(
    p: RemediationProposal, scope: TenantScope, operationKey: string, workerId: string, nowIso: string,
  ): Promise<ExecutionOutcome> {
    const d = await this.deps.store.getDesktopById(p.desktopId, scope);
    if (!d) {
      return this.finish(operationKey, workerId, 'refused', { reason: 'desktop not found' }, 'desktop not found', false);
    }
    try {
      // The restart itself is the guest action; the broker's execute path is
      // the dispatch (provider-level display restart command).
      await this.deps.broker.execute(p.desktopId, { kind: 'shell', command: 'restart-display-service' }, scope);
      // Probe the display state — healthy proves success.
      const probe = await this.deps.guest.checkDisplay(p.desktopId, d.provider_id, scope);
      if (probe?.healthy) {
        return this.finish(operationKey, workerId, 'success', { recoveredAt: nowIso, displayHealthy: true }, null, true);
      }
      // Unhealthy after a COMPLETED restart command: the restart executed but
      // did not fix it — that's a real negative outcome, not an ambiguity.
      return this.finish(operationKey, workerId, 'refused',
        { displayHealthy: false, guestError: probe?.error ?? 'still failing', at: nowIso },
        'display still failing after completed recovery attempt', true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Uncertain dispatch: persist reconciling, then probe the display.
      await this.deps.store.updateRemediationOperation({
        operationKey, workerId, newStatus: 'reconciling',
        outcomeEvidence: { error: msg, at: nowIso },
      });
      const probe = await this.deps.guest.checkDisplay(p.desktopId, d.provider_id, scope).catch(() => null);
      if (probe?.healthy) {
        // Healthy display proves the desired outcome even though the response
        // was lost — success without another restart.
        return this.finish(operationKey, workerId, 'success', { reconciledAt: nowIso, displayHealthy: true, error: msg }, null, true);
      }
      if (probe && !probe.healthy) {
        // Unhealthy alone does NOT prove the restart never executed. The
        // probe cannot resolve the ambiguity ⇒ explicit unresolved.
        return this.finish(operationKey, workerId, 'unresolved',
          { error: msg, displayHealthy: false, unresolvedAt: nowIso,
            note: 'unhealthy display does not establish whether the restart executed; ambiguity retained' }, null, true);
      }
      // Probe itself failed: fully unresolved.
      return this.finish(operationKey, workerId, 'unresolved',
        { error: msg, probeFailed: true, unresolvedAt: nowIso }, null, true);
    }
  }

  /** Terminal write with replay safety: a FAILED evidence write is retried
   *  by re-calling with the same outcome — the action is never repeated
   *  because terminal states are immutable in the store. */
  private async finish(
    operationKey: string, workerId: string,
    status: 'success' | 'refused' | 'exhausted' | 'unresolved',
    evidence: Record<string, unknown>, refusalReason: string | null, dispatched: boolean,
  ): Promise<ExecutionOutcome> {
    await this.deps.store.updateRemediationOperation({
      operationKey, workerId, newStatus: status,
      outcomeEvidence: evidence, refusalReason,
    });
    return { operationKey, status, refusalReason: refusalReason ?? undefined, dispatched, evidence };
  }
}
