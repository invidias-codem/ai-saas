// lib/vdi/fleet/fleetObserver.ts
// VDI-3A: Fleet observations — provider state, guest/display health, broker
// state, active leases, observation timestamps.
//
// Invariants (acceptance gate):
//   - Provider outage ⇒ observation records 'unknown' + error + checked_at;
//     the LAST GOOD provider report stays with its own observed_at. Ownership,
//     desired phase, and lease state are NEVER mutated.
//   - Guest/display health is independent of provider lifecycle: a running
//     provider resource can have a failed display service.
//   - Orphan discovery (provider has it, store does not) records quarantine
//     evidence and triggers reconciliation — never deletion.

import type { TenantScope, DesktopPhase } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';

export interface ProviderObservationSource {
  /** Provider read. Returns null (or throws) when the API is unreachable. */
  getDesktopState(providerId: string, scope: TenantScope): Promise<{ phase: DesktopPhase; resumeKey?: string } | null>;
  /** Observed runtime class of the resource ('container', 'linux-vm', ...). */
  getResourceClass?(providerId: string, scope: TenantScope): Promise<string | null>;
  /** List provider resources for a workspace (orphan discovery). */
  listProviderDesktops(scope: TenantScope): Promise<Array<{ providerId: string; phase: DesktopPhase; labels?: Record<string, string> }>>;
}

export interface GuestObservationSource {
  /** Guest/display health INSIDE the desktop. Throws/null when unobservable. */
  checkDisplay(desktopId: string, providerId: string, scope: TenantScope): Promise<{ healthy: boolean; error?: string } | null>;
}

export interface FleetObservationInput {
  desktopId: string;
  providerId: string;
  scope: TenantScope;
}

export interface ObservationOutcome {
  desktopId: string;
  providerReachable: boolean;
  providerPhase: DesktopPhase | null;
  providerClass: string | null;
  providerObservedAt: string | null;
  providerError: string | null;
  guestDisplayHealthy: boolean | null;
  guestError: string | null;
  guestObservedAt: string | null;
  brokerPhase: DesktopPhase;
  generation: number;
  sessionLeaseActive: boolean;
  executionLeaseActive: boolean;
  inputControlHolder: string | null;
  lastOperationKey: string | null;
  /** Collection start — older collections never overwrite newer writes. */
  collectedAt?: string;
}

export interface FleetObservationResult {
  observed: number;
  providerOutages: number;
  displayFailures: number;
  orphansQuarantined: number;
  errors: string[];
}

export class FleetObserver {
  constructor(
    private readonly store: DesktopStore,
    private readonly provider: ProviderObservationSource,
    private readonly guest: GuestObservationSource,
    private readonly clock: { now(): string },
  ) {}

  /** Observe every desktop in a workspace. Outages never mutate broker state. */
  async observeWorkspace(scope: TenantScope): Promise<FleetObservationResult> {
    const result: FleetObservationResult = {
      observed: 0, providerOutages: 0, displayFailures: 0, orphansQuarantined: 0, errors: [],
    };

    const desktops = await this.store.listDesktops(scope);
    for (const d of desktops) {
      try {
        await this.observeOne({ desktopId: d.desktop_id, providerId: d.provider_id, scope }, result);
      } catch (error) {
        result.errors.push(`${d.desktop_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Orphan discovery: provider resources with our labels but no store row.
    // QUARANTINE rule preserved — record + reconcile, never destroy.
    try {
      const providerDesktops = await this.provider.listProviderDesktops(scope);
      const known = new Set(desktops.map(d => d.provider_id));
      for (const p of providerDesktops) {
        if (known.has(p.providerId)) continue;
        const labels = p.labels || {};
        if (labels['lattice-tenant'] !== scope.tenantId || labels['lattice-workspace'] !== scope.workspaceId) continue;
        result.orphansQuarantined++;
        await this.store.recordEvidence({
          desktopId: '', // no store row — this evidence IS the quarantine record
          operationKey: labels['lattice-operation-key'] ?? null,
          operationType: 'fleet_observation',
          desiredState: 'quarantined',
          observedState: p.phase,
          failureClass: 'OrphanedProviderDesktop',
          metadata: {
            providerId: p.providerId,
            quarantined: true,
            retirementRequires: ['operation_key_reconciliation', 'ownership_verification'],
          },
        });
      }
    } catch (error) {
      // Provider list failure is an outage signal, not a desktop mutation.
      result.errors.push(`orphan-scan: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /** Observe one desktop. Records the observation; touches nothing else. */
  private async observeOne(input: FleetObservationInput, result: FleetObservationResult): Promise<void> {
    const { desktopId, providerId, scope } = input;
    const now = this.clock.now();
    // Collection START: concurrent observers cannot let an older collection
    // overwrite a newer one (stale writes dropped by the store/RPC).
    const collectedAt = now;

    const desktop = await this.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`desktop ${desktopId} not found`);

    // ── Provider observation. An outage is a NEW fact: record unreachable +
    //    error + checked_at, KEEP the last good phase with its observed_at.
    //    The previous observation (if any) supplies the retained values —
    //    the row must never regress from known to unknown.
    const prevObs = await this.store.getObservation(desktopId);
    let providerReachable = true;
    let providerPhase: DesktopPhase | null = null;
    let providerClass: string | null = (prevObs?.providerClass as string | null) ?? null;
    let providerError: string | null = null;
    let providerObservedAt: string | null = (prevObs?.providerObservedAt as string | null) ?? null;
    try {
      const state = await this.provider.getDesktopState(providerId, scope);
      if (state) {
        providerPhase = state.phase;
        providerObservedAt = now;
      } else {
        providerReachable = false;
        providerError = 'provider returned no state';
        providerPhase = (prevObs?.providerPhase as DesktopPhase | null) ?? null;
      }
      const observedClass = this.provider.getResourceClass
        ? await this.provider.getResourceClass(providerId, scope)
        : null;
      if (observedClass) providerClass = observedClass;
    } catch (error) {
      providerReachable = false;
      providerError = error instanceof Error ? error.message : String(error);
      providerPhase = (prevObs?.providerPhase as DesktopPhase | null) ?? null;
      result.providerOutages++;
    }

    // ── Guest/display observation. Independent of provider lifecycle: a
    //    running resource can have a failed display; an unreachable provider
    //    leaves the guest report untouched (not 'healthy', not 'failed').
    let guestDisplayHealthy: boolean | null = null;
    let guestError: string | null = null;
    let guestObservedAt: string | null = null;
    if (providerReachable) {
      try {
        const guest = await this.guest.checkDisplay(desktopId, providerId, scope);
        if (guest) {
          guestDisplayHealthy = guest.healthy;
          guestError = guest.error ?? null;
          guestObservedAt = now;
          if (!guest.healthy) result.displayFailures++;
        }
      } catch (error) {
        guestError = error instanceof Error ? error.message : String(error);
        guestObservedAt = now;
      }
    }

    // ── Broker snapshot (read-only copy; authority stays in vdi_desktops).
    const sessionActive = !!(desktop.session_lease_id && desktop.session_lease_expires_at && desktop.session_lease_expires_at > now);
    const executionActive = !!(desktop.execution_lease_id && desktop.execution_lease_expires_at && desktop.execution_lease_expires_at > now);

    const outcome: ObservationOutcome = {
      desktopId,
      providerReachable,
      providerPhase,
      providerClass,
      providerObservedAt,
      providerError,
      guestDisplayHealthy,
      guestError,
      guestObservedAt,
      brokerPhase: desktop.phase,
      generation: desktop.generation,
      sessionLeaseActive: sessionActive,
      executionLeaseActive: executionActive,
      inputControlHolder: desktop.input_control_lease_type
        ? `${desktop.input_control_lease_type}:${desktop.input_control_lease_id ?? ''}`
        : null,
      lastOperationKey: desktop.operation_key,
      collectedAt,
    };

    await this.store.recordObservation(outcome);
    result.observed++;
  }
}
