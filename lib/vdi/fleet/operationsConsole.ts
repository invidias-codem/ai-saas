// lib/vdi/fleet/operationsConsole.ts
// VDI-3B: Fleet operations console — READ-ONLY over stored observations.
//
// Access boundary (acceptance):
//   - Server-side operator authorization on EVERY list and detail request
//     (reuses lib/security/workspaceAccess, never client claims).
//   - Tenant/workspace filtering is part of the query, not a post-filter.
//   - Inventory permission grants NO viewer tokens, NO screen/file access —
//     this module only reads observation/broker state and mints nothing.
//   - Freshness is shown beside each fact; retained history can never
//     appear current ("Provider unreachable; last reported ready at …").
//   - Viewing causes zero provisioning/lifecycle mutations: this module
//     has no write path other than nothing at all.

import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore } from '@/lib/vdi/store/desktopStoreInterface';

/** Server-side operator authorization. Wire to lib/security/workspaceAccess in the route. */
export interface OperatorAuthorizer {
  /** Returns the scopes the operator may see, or throws/rejects when unauthorized. */
  authorize(operatorUserId: string, requestedWorkspaceId: string): Promise<TenantScope>;
}

export interface FleetInventoryEntry {
  desktopId: string;
  tenantId: string;
  workspaceId: string;
  runtimeClass: string;                    // provider-observed class
  brokerPhase: string;                     // intended state
  providerReachable: boolean;
  providerPhase: string | null;
  providerObservedAt: string | null;       // freshness beside the fact
  guestDisplayHealthy: boolean | null;     // null = unknown (e.g. suspended)
  guestObservedAt: string | null;
  /** Human sentence for the console, e.g. "Provider unreachable; last reported ready at 2026-…" */
  providerStatusText: string;
  generation: number;
  sessionLeaseActive: boolean;
  executionLeaseActive: boolean;
  inputControlHolder: string | null;
  lastOperationKey: string | null;
  observedAt: string;                      // collection time
}

export interface DesktopDetail extends FleetInventoryEntry {
  providerId: string;
  imageVersion: string;
  specHash: string;
  sessionLeaseId: string | null;
  sessionLeaseUserId: string | null;
  sessionLeaseExpiresAt: string | null;
  executionLeaseId: string | null;
  executionLeaseAgentId: string | null;
  executionLeaseExpiresAt: string | null;
}

export class OperationsConsole {
  constructor(
    private readonly store: DesktopStore,
    private readonly authorizer: OperatorAuthorizer,
  ) {}

  /**
   * Fleet inventory for one workspace. Authorization is server-side and
   * happens BEFORE any store read; the store query itself is scoped.
   * READ-ONLY: no broker, provider, or lease calls — observations only.
   */
  async listFleet(operatorUserId: string, requestedWorkspaceId: string): Promise<FleetInventoryEntry[]> {
    const scope = await this.authorizer.authorize(operatorUserId, requestedWorkspaceId);
    const rows = await this.store.listDesktops(scope);
    const entries: FleetInventoryEntry[] = [];
    for (const row of rows) {
      const obs = await this.store.getObservation(row.desktop_id);
      entries.push(toInventoryEntry(row, obs));
    }
    return entries;
  }

  /**
   * Desktop detail. Unauthorized desktop IDs fail server-side: the desktop
   * is looked up ONLY within the authorized scope, so a foreign ID yields
   * 'not found' with no information leak.
   */
  async getDesktopDetail(operatorUserId: string, requestedWorkspaceId: string, desktopId: string): Promise<DesktopDetail | null> {
    const scope = await this.authorizer.authorize(operatorUserId, requestedWorkspaceId);
    const row = await this.store.getDesktopById(desktopId, scope);
    if (!row) return null; // unauthorized or absent — indistinguishable by design
    const obs = await this.store.getObservation(desktopId);
    return {
      ...toInventoryEntry(row, obs),
      providerId: row.provider_id,
      imageVersion: row.image_version,
      specHash: row.spec_hash,
      sessionLeaseId: row.session_lease_id,
      sessionLeaseUserId: row.session_lease_user_id,
      sessionLeaseExpiresAt: row.session_lease_expires_at,
      executionLeaseId: row.execution_lease_id,
      executionLeaseAgentId: row.execution_lease_agent_id,
      executionLeaseExpiresAt: row.execution_lease_expires_at,
    };
  }
}

function toInventoryEntry(
  row: { desktop_id: string; tenant_id: string; workspace_id: string; runtime_type: string; phase: string; generation: number; session_lease_id: string | null; session_lease_expires_at: string | null; execution_lease_id: string | null; execution_lease_expires_at: string | null; input_control_lease_type: string | null; input_control_lease_id: string | null; operation_key: string | null },
  obs: Record<string, unknown> | null,
): FleetInventoryEntry {
  const nowIso = new Date().toISOString();
  const reachable = (obs?.providerReachable as boolean | undefined) ?? true;
  const providerPhase = (obs?.providerPhase as string | null) ?? null;
  const providerObservedAt = (obs?.providerObservedAt as string | null) ?? null;
  const guestHealthy = (obs?.guestDisplayHealthy as boolean | null) ?? null;
  const guestObservedAt = (obs?.guestObservedAt as string | null) ?? null;
  const sessionActive = !!(row.session_lease_id && row.session_lease_expires_at && row.session_lease_expires_at > nowIso);
  const executionActive = !!(row.execution_lease_id && row.execution_lease_expires_at && row.execution_lease_expires_at > nowIso);

  // Suspended desktops display guest health as unknown (no live guest check).
  const suspended = row.phase === 'suspended' || row.phase === 'suspending';
  const guestShown = suspended ? null : guestHealthy;

  return {
    desktopId: row.desktop_id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    runtimeClass: (obs?.providerClass as string | null) ?? row.runtime_type,
    brokerPhase: row.phase,
    providerReachable: reachable,
    providerPhase,
    providerObservedAt,
    guestDisplayHealthy: guestShown,
    guestObservedAt,
    // Freshness sentence: retained history can never read as current.
    providerStatusText: reachable
      ? `Provider reports ${providerPhase ?? 'unknown'} (observed ${providerObservedAt ?? 'never'})`
      : `Provider unreachable; last reported ${providerPhase ?? 'unknown'} at ${providerObservedAt ?? 'never'}`,
    generation: row.generation,
    sessionLeaseActive: sessionActive,
    executionLeaseActive: executionActive,
    inputControlHolder: row.input_control_lease_type
      ? `${row.input_control_lease_type}:${row.input_control_lease_id ?? ''}`
      : null,
    lastOperationKey: row.operation_key,
    observedAt: (obs?.checkedAt as string) ?? '',
  };
}
