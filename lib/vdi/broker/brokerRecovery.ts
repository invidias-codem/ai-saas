// lib/vdi/broker/brokerRecovery.ts
// VDI-2A: Broker Restart Recovery
//
// Reconciles durable state with provider state on broker startup.
// Ensures ownership, leases, and generation are preserved across restarts.
//
// Orphan policy: QUARANTINE, NEVER DESTROY. Labels establish association,
// not permission to delete — a missing store row can be a persistence lag,
// delayed reconciliation, or a DB outage, not a leaked resource.

import type { TenantScope, DesktopPhase, DesktopSpec } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore, VdiDesktopRow } from '@/lib/vdi/store/desktopStoreInterface';

export interface ProviderDesktopState {
  providerId: string;
  phase: DesktopPhase;
  resumeKey?: string;
  labels?: Record<string, string>;
}

export interface ProviderAdapter {
  /** Get all desktops for a workspace from the provider */
  listProviderDesktops(scope: TenantScope): Promise<ProviderDesktopState[]>;
  /** Get a specific desktop state from the provider */
  getProviderDesktop(providerId: string, scope: TenantScope): Promise<ProviderDesktopState | null>;
  /** Destroy a desktop at provider level — ONLY for explicit retirement decisions. */
  forceDestroyProviderDesktop(providerId: string, scope: TenantScope): Promise<void>;
}

export interface RecoveryResult {
  reconciled: number;
  /** Orphaned desktops quarantined (recorded, NOT destroyed). */
  orphanedQuarantined: number;
  staleLeasesRevoked: number;
  errors: string[];
}

export class BrokerRecovery {
  constructor(
    private readonly store: DesktopStore,
    private readonly provider: ProviderAdapter,
    private readonly clock: { now(): string }
  ) {}

  /**
   * Run full reconciliation on broker startup for a workspace.
   * Should be called once per workspace during broker initialization.
   */
  async recoverWorkspace(scope: TenantScope): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      reconciled: 0,
      orphanedQuarantined: 0,
      staleLeasesRevoked: 0,
      errors: [],
    };

    try {
      // 1. Get all desktops from durable store
      const storeDesktops = await this.store.listDesktops(scope);

      // 2. Get all desktops from provider
      const providerDesktops = await this.provider.listProviderDesktops(scope);
      const providerDesktopMap = new Map(providerDesktops.map(d => [d.providerId, d]));

      // 3. Reconcile each desktop in store
      for (const desktop of storeDesktops) {
        try {
          await this.reconcileDesktop(desktop, providerDesktopMap, scope, result);
        } catch (error) {
          result.errors.push(`Desktop ${desktop.desktop_id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // 4. Find orphaned provider desktops (exist at provider but not in store)
      const storeProviderIds = new Set(storeDesktops.map(d => d.provider_id));
      for (const providerDesktop of providerDesktops) {
        if (!storeProviderIds.has(providerDesktop.providerId)) {
          try {
            await this.handleOrphanedDesktop(providerDesktop, scope, result);
          } catch (error) {
            result.errors.push(`Orphan ${providerDesktop.providerId}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

    } catch (error) {
      result.errors.push(`Workspace recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Reconcile a single desktop between store and provider
   */
  private async reconcileDesktop(
    storeDesktop: VdiDesktopRow,
    providerDesktopMap: Map<string, ProviderDesktopState>,
    scope: TenantScope,
    result: RecoveryResult
  ): Promise<void> {
    const providerDesktop = providerDesktopMap.get(storeDesktop.provider_id);

    if (!providerDesktop) {
      // Desktop exists in store but not at provider
      // If phase is terminal, keep it. If not, mark as failed.
      if (['destroyed', 'failed'].includes(storeDesktop.phase)) {
        // Already terminal, nothing to do
        return;
      }

      // Mark as failed since provider resource is gone
      await this.store.updateDesktopPhase(
        storeDesktop.desktop_id,
        scope,
        'failed',
        storeDesktop.generation
      );

      await this.store.recordEvidence({
        desktopId: storeDesktop.desktop_id,
        operationKey: storeDesktop.operation_key,
        operationType: 'recovery',
        desiredState: storeDesktop.phase,
        observedState: 'failed',
        failureClass: 'ProviderDesktopMissing',
        metadata: { providerId: storeDesktop.provider_id, recovery: true },
      });

      result.reconciled++;
      return;
    }

    // Provider desktop exists - reconcile state
    const storePhase = storeDesktop.phase;
    const providerPhase = providerDesktop.phase;

    // Update resume key if provider has one
    if (providerDesktop.resumeKey && providerDesktop.resumeKey !== storeDesktop.resume_key) {
      await this.store.updateDesktopResumeKey(
        storeDesktop.desktop_id,
        scope,
        providerDesktop.resumeKey,
        storeDesktop.generation
      );
    }

    // Handle phase mismatches
    if (storePhase !== providerPhase) {
      // Provider is authoritative for phase
      await this.store.updateDesktopPhase(
        storeDesktop.desktop_id,
        scope,
        providerPhase,
        storeDesktop.generation
      );

      await this.store.recordEvidence({
        desktopId: storeDesktop.desktop_id,
        operationKey: storeDesktop.operation_key,
        operationType: 'recovery',
        desiredState: storePhase,
        observedState: providerPhase,
        metadata: { providerId: storeDesktop.provider_id, recovery: true, phaseReconciled: true },
      });
    }

    // Revoke stale leases (expired but not cleaned up)
    await this.reconcileLeases(storeDesktop, scope, result);

    result.reconciled++;
    providerDesktopMap.delete(storeDesktop.provider_id);
  }

  /**
   * Revoke expired leases that weren't cleaned up
   */
  private async reconcileLeases(
    desktop: VdiDesktopRow,
    scope: TenantScope,
    result: RecoveryResult
  ): Promise<void> {
    const now = this.clock.now();

    // Check session lease
    if (desktop.session_lease_id && desktop.session_lease_expires_at) {
      if (desktop.session_lease_expires_at <= now) {
        await this.store.revokeSessionLease(
          desktop.desktop_id,
          desktop.session_lease_id,
          scope,
          'system',
          'expired_during_recovery'
        );
        result.staleLeasesRevoked++;
      }
    }

    // Check execution lease
    if (desktop.execution_lease_id && desktop.execution_lease_expires_at) {
      if (desktop.execution_lease_expires_at <= now) {
        await this.store.revokeExecutionLease(
          desktop.desktop_id,
          desktop.execution_lease_id,
          scope,
          'system',
          'expired_during_recovery'
        );
        result.staleLeasesRevoked++;
      }
    }

    // Check input control lease
    if (desktop.input_control_lease_id && desktop.input_control_lease_expires_at) {
      if (desktop.input_control_lease_expires_at <= now) {
        await this.store.revokeInputControlLease(
          desktop.desktop_id,
          desktop.input_control_lease_id,
          scope,
          'expired_during_recovery'
        );
        result.staleLeasesRevoked++;
      }
    }

    // Always revoke connection grants on recovery (short-lived, must re-request)
    await this.store.revokeConnectionGrants(desktop.desktop_id, 'broker_restart');
  }

  /**
   * Handle a desktop that exists at provider but not in store (orphaned).
   *
   * QUARANTINE, NEVER DESTROY. Labels establish association, not permission
   * to delete. A missing store row can mean: provisioning succeeded before
   * persistence completed, delayed reconciliation, or a database outage.
   * Recovery records the orphan as quarantined and leaves the provider
   * resource untouched. Destruction happens only through an explicit
   * retirement decision (with retention safeguards) reconciling the
   * operation key and ownership first.
   */
  private async handleOrphanedDesktop(
    providerDesktop: ProviderDesktopState,
    scope: TenantScope,
    result: RecoveryResult
  ): Promise<void> {
    // Check if this provider desktop belongs to us (has our labels)
    const labels = providerDesktop.labels || {};
    const isOurs = labels['lattice-tenant'] === scope.tenantId &&
                   labels['lattice-workspace'] === scope.workspaceId;

    if (!isOurs) {
      // Not ours - could be another workspace's desktop, leave it alone
      return;
    }

    // Ours but unrecorded: quarantine. Record it so it is visible and
    // reconcilable; do NOT touch the provider resource.
    result.orphanedQuarantined++;

    await this.store.recordEvidence({
      desktopId: '', // No store row yet — this evidence row is the quarantine record
      operationKey: labels['lattice-operation-key'] ?? null,
      operationType: 'recovery',
      desiredState: 'quarantined',
      observedState: providerDesktop.phase,
      failureClass: 'OrphanedProviderDesktop',
      metadata: {
        providerId: providerDesktop.providerId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        specHash: labels['lattice-spec-hash'] ?? null,
        quarantined: true,
        // Retention: an explicit retirement decision must reconcile the
        // operation key + ownership before any destroy is authorized.
        retirementRequires: ['operation_key_reconciliation', 'ownership_verification'],
      },
    });
  }
}

/**
 * Run recovery for all workspaces (called on broker process startup)
 */
export async function runBrokerRecovery(
  store: DesktopStore,
  provider: ProviderAdapter,
  workspaces: TenantScope[],
  clock: { now(): string }
): Promise<RecoveryResult[]> {
  const recovery = new BrokerRecovery(store, provider, clock);
  const results: RecoveryResult[] = [];

  for (const scope of workspaces) {
    const result = await recovery.recoverWorkspace(scope);
    results.push(result);
  }

  return results;
}

// ── Daytona Provider Adapter for Recovery ────────────────────────────────────

import { Daytona, Sandbox } from '@daytona/sdk';
import { env } from '@/lib/env';

let _cachedDaytonaClient: Daytona | null = null;

function getDaytonaClient(): Daytona {
  if (!_cachedDaytonaClient) {
    const apiKey = env.DAYTONA_API_KEY;
    const apiUrl = env.DAYTONA_API_URL ?? 'https://app.daytona.io/api';
    const target = env.DAYTONA_TARGET ?? 'us';

    if (!apiKey) {
      throw new Error('DAYTONA_API_KEY not configured');
    }

    _cachedDaytonaClient = new Daytona({ apiKey, apiUrl, target });
  }
  return _cachedDaytonaClient;
}

export function createDaytonaRecoveryAdapter(): ProviderAdapter {
  const client = getDaytonaClient();

  return {
    async listProviderDesktops(scope: TenantScope): Promise<ProviderDesktopState[]> {
      const results: ProviderDesktopState[] = [];
      for await (const sandbox of client.list({
        labels: { 'lattice-tenant': scope.tenantId, 'lattice-workspace': scope.workspaceId },
      })) {
        results.push({
          providerId: sandbox.id,
          phase: mapDaytonaStateToPhase(sandbox.state ?? ''),
          resumeKey: sandbox.id,
          labels: sandbox.labels || {},
        });
      }
      return results;
    },

    async getProviderDesktop(providerId: string, scope: TenantScope): Promise<ProviderDesktopState | null> {
      try {
        const sandbox = await client.get(providerId);
        if (!sandbox) return null;

        // Verify ownership
        const labels = sandbox.labels || {};
        if (labels['lattice-tenant'] !== scope.tenantId || labels['lattice-workspace'] !== scope.workspaceId) {
          return null;
        }

        return {
          providerId: sandbox.id,
          phase: mapDaytonaStateToPhase(sandbox.state ?? ''),
          resumeKey: sandbox.id,
          labels: sandbox.labels || {},
        };
      } catch {
        return null;
      }
    },

    async forceDestroyProviderDesktop(providerId: string, scope: TenantScope): Promise<void> {
      // Only reachable via an explicit retirement decision, never from recovery.
      try {
        const sandbox = await client.get(providerId);
        if (sandbox) {
          await sandbox.delete(60, true);
        }
      } catch (error) {
        console.error(`Failed to force destroy desktop ${providerId}:`, error);
        throw error;
      }
    },
  };
}

function mapDaytonaStateToPhase(state: string): DesktopPhase {
  switch (state) {
    case 'started': return 'ready';
    case 'stopped': return 'suspended';
    case 'paused': return 'suspended';
    case 'snapshotting': return 'ready';
    case 'archived': return 'suspended';
    case 'destroyed': return 'destroyed';
    case 'error': return 'failed';
    default: return 'provisioning';
  }
}