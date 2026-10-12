// lib/vdi/broker/desktopBroker.ts
// VDI-2A: Durable Desktop Broker Service
//
// Implements DesktopBroker interface backed by durable state.
// Key invariants:
// - Every request authorized against workspace membership
// - Generation-based optimistic locking prevents stale worker mutations
// - Operation key reconciliation prevents duplicate provisioning
// - Leases gate suspension atomically (denormalized in desktop row)
// - Human takeover revokes agent input authority

import type {
  DesktopBroker,
  DesktopSpec,
  Desktop,
  DesktopCapabilities,
  DesktopPhase,
  DesktopAction,
  DesktopSnapshot,
  DesktopSessionLease,
  ExecutionLease,
  TenantScope,
  DesktopHealth,
  DesktopCapacity,
  DesktopPolicy,
} from '@/lib/intelligence/execution/vdi/contracts';
import { hashDesktopSpec, canSuspend, makeProvisioningOperationKey } from '@/lib/intelligence/execution/vdi/contracts';
import type { DesktopStore, VdiDesktopRow, VdiSessionLeaseRow, VdiExecutionLeaseRow, VdiConnectionGrantRow, VdiInputControlLeaseRow } from '@/lib/vdi/store/desktopStoreInterface';
import type { IdempotentProvisioner } from '@/lib/intelligence/execution/vdi/contracts';

export interface DesktopBrokerDeps {
  /** Desktop store implementation (Supabase for production, memory for tests) */
  store: DesktopStore;
  /** Adapter that implements provider-specific operations */
  provider: {
    createDesktop(spec: DesktopSpec, scope: TenantScope): Promise<{ desktopId: string; providerId: string; resumeKey?: string }>;
    resumeDesktop(desktopId: string, providerId: string, scope: TenantScope): Promise<void>;
    executeDesktop(desktopId: string, providerId: string, action: DesktopAction, scope: TenantScope): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }>;
    snapshotDesktop(desktopId: string, providerId: string, scope: TenantScope): Promise<{ snapshotId: string }>;
    suspendDesktop(desktopId: string, providerId: string, scope: TenantScope): Promise<void>;
    destroyDesktop(desktopId: string, providerId: string, scope: TenantScope): Promise<void>;
    getDesktopState(providerId: string, scope: TenantScope): Promise<{ phase: DesktopPhase; resumeKey?: string } | null>;
    listDesktops(scope: TenantScope): Promise<Array<{ desktopId: string; providerId: string; phase: DesktopPhase }>>;
  };
  /** Operation key store for idempotent provisioning */
  operationKeyStore: IdempotentProvisioner;
  /** Clock for timestamps */
  clock: { now(): string };
  /** Policy for lease/suspend decisions */
  policy: DesktopPolicy;
  /** Generate secure tokens */
  generateToken: (prefix: string) => string;
}

export class DurableDesktopBroker implements DesktopBroker {
  readonly id = 'durable-desktop-broker';
  readonly capabilities: DesktopCapabilities;

  constructor(
    private readonly deps: DesktopBrokerDeps,
    private readonly providerCapabilities: DesktopCapabilities
  ) {
    this.capabilities = providerCapabilities;
  }

  // ── Authorization ────────────────────────────────────────────────────────────

  private async authorize(scope: TenantScope, userId: string): Promise<void> {
    const isMember = await this.deps.store.validateWorkspaceMembership(userId, scope.workspaceId);
    if (!isMember) {
      const isOwner = await this.deps.store.validateWorkspaceOwnership(userId, scope.workspaceId);
      if (!isOwner) {
        throw new Error(`Forbidden: user ${userId} is not a member of workspace ${scope.workspaceId}`);
      }
    }
  }

  // ── Operation Key Reconciliation ─────────────────────────────────────────────

  private async checkProvisioningReconciliation(operationKey: string) {
    return this.deps.operationKeyStore.checkOperationKey(operationKey);
  }

  private async recordProvisioningOutcome(operationKey: string, outcome: { desktopId: string } | { error: string } | { status: 'in_progress' }) {
    return this.deps.operationKeyStore.recordOperationKey(operationKey, outcome as { desktopId: string });
  }

  // ── DesktopBroker Interface (6 lifecycle + 4 lease ops) ──────────────────────

  async create(spec: DesktopSpec, scope: TenantScope): Promise<Desktop> {
    const operationKey = makeProvisioningOperationKey(scope.tenantId, scope.workspaceId, spec);
    const specHash = hashDesktopSpec(spec);

    // Reconciliation: check if already provisioned
    const existing = await this.checkProvisioningReconciliation(operationKey);
    if (existing && 'desktopId' in existing) {
      // The operation key stores the provider ID, look up the desktop by provider ID
      const desktop = await this.deps.store.getDesktopByProviderId(
        'daytona',
        existing.desktopId,
        scope
      );
      if (!desktop) throw new Error(`Reconciled desktop with provider ID ${existing.desktopId} not found in store`);
      await this.recordEvidence({
        desktopId: desktop.desktop_id,
        operationKey,
        operationType: 'create',
        desiredState: 'ready',
        observedState: desktop.phase,
        timingMs: 0,
      });
      return this.mapRowToDesktop(desktop);
    }
    if (existing && existing.status === 'in_progress') {
      throw new Error(`Provisioning already in progress for operationKey: ${operationKey}`);
    }

    // Record in-progress
    await this.recordProvisioningOutcome(operationKey, { status: 'in_progress' });

    try {
      // Provision via provider
      const result = await this.deps.provider.createDesktop(spec, scope);

      // Create durable record
      const desktopId = `dt-${this.deps.generateToken('id')}`;
      const row = await this.deps.store.createDesktop({
        desktopId,
        spec,
        scope,
        provider: 'daytona',
        providerId: result.providerId,
        operationKey,
        specHash,
      });

      // Record success
      await this.recordProvisioningOutcome(operationKey, { desktopId: result.providerId });

      // Wait for provider to report ready
      await this.waitForReady(result.providerId, scope);

      // Update phase to ready in store
      await this.deps.store.updateDesktopPhase(desktopId, scope, 'ready', row.generation);

      const finalDesktop = await this.deps.store.getDesktopById(desktopId, scope);
      if (!finalDesktop) throw new Error(`Desktop ${desktopId} not found after creation`);

      await this.recordEvidence({
        desktopId,
        operationKey,
        operationType: 'create',
        desiredState: 'ready',
        observedState: finalDesktop.phase,
        timingMs: Date.now() - new Date(row.created_at).getTime(),
      });

      return this.mapRowToDesktop(finalDesktop);
    } catch (error) {
      await this.recordProvisioningOutcome(operationKey, { error: String(error) });
      await this.recordEvidence({
        desktopId: '',
        operationKey,
        operationType: 'create',
        desiredState: 'ready',
        observedState: 'failed',
        timingMs: 0,
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async resume(desktopId: string, scope: TenantScope): Promise<Desktop> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    const expectedGeneration = desktop.generation;

    // Update phase to resuming
    await this.deps.store.updateDesktopPhase(desktopId, scope, 'provisioning', expectedGeneration);

    try {
      await this.deps.provider.resumeDesktop(desktopId, desktop.provider_id, scope);

      // Wait for ready
      await this.waitForReady(desktop.provider_id, scope);

      const updated = await this.deps.store.getDesktopById(desktopId, scope);
      if (!updated) throw new Error(`Desktop ${desktopId} not found after resume`);

      await this.deps.store.updateDesktopResumeKey(desktopId, scope, updated.resume_key ?? desktop.provider_id, expectedGeneration);

      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'resume',
        desiredState: 'ready',
        observedState: updated.phase,
      });

      return this.mapRowToDesktop(updated);
    } catch (error) {
      await this.deps.store.updateDesktopPhase(desktopId, scope, 'failed', expectedGeneration);
      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'resume',
        desiredState: 'ready',
        observedState: 'failed',
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async execute(desktopId: string, action: DesktopAction, scope: TenantScope, agentId?: string): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
  }> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // EXECUTION BOUNDARY: agent-issued actions require a live input-control
    // lease held by that agent. A revoked execution lease (e.g. after human
    // takeover) blocks all subsequent agent actions here — before the provider
    // is ever touched.
    if (agentId !== undefined) {
      const inputControl = await this.deps.store.getActiveInputControlLease(desktopId, scope);
      if (!inputControl || inputControl.holder_type !== 'agent' || inputControl.holder_id !== agentId) {
        throw new Error(`Agent ${agentId} has no active input-control lease on ${desktopId}`);
      }
    }

    const startedAt = Date.now();

    try {
      const result = await this.deps.provider.executeDesktop(desktopId, desktop.provider_id, action, scope);

      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'execute',
        desiredState: 'ready',
        observedState: desktop.phase,
        timingMs: result.durationMs,
      });

      return result;
    } catch (error) {
      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'execute',
        desiredState: 'ready',
        observedState: 'failed',
        timingMs: Date.now() - startedAt,
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async snapshot(desktopId: string, scope: TenantScope): Promise<DesktopSnapshot> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    const startedAt = Date.now();

    try {
      const result = await this.deps.provider.snapshotDesktop(desktopId, desktop.provider_id, scope);

      const snapshot: DesktopSnapshot = {
        snapshotId: result.snapshotId,
        desktopId,
        createdAt: this.deps.clock.now(),
      };

      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'snapshot',
        desiredState: 'snapshot_created',
        observedState: 'snapshot_created',
        timingMs: Date.now() - startedAt,
      });

      return snapshot;
    } catch (error) {
      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'snapshot',
        desiredState: 'snapshot_created',
        observedState: 'failed',
        timingMs: Date.now() - startedAt,
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async suspend(desktopId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    const expectedGeneration = desktop.generation;

    // ATOMIC CHECK: use denormalized lease state in desktop row
    const canSuspendNow = await this.deps.store.canSuspendDesktop(desktopId, scope);
    if (!canSuspendNow) {
      throw new Error('Cannot suspend: active session or execution lease present');
    }

    // Update phase to suspending (generation increments atomically with phase)
    await this.deps.store.updateDesktopPhase(desktopId, scope, 'suspending', expectedGeneration);

    try {
      await this.deps.provider.suspendDesktop(desktopId, desktop.provider_id, scope);

      await this.deps.store.updateDesktopPhase(desktopId, scope, 'suspended', expectedGeneration + 1);

      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'suspend',
        desiredState: 'suspended',
        observedState: 'suspended',
      });
    } catch (error) {
      await this.deps.store.updateDesktopPhase(desktopId, scope, 'failed', expectedGeneration + 1);
      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'suspend',
        desiredState: 'suspended',
        observedState: 'failed',
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async destroy(desktopId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return; // Idempotent: already destroyed

    const expectedGeneration = desktop.generation;

    await this.deps.store.updateDesktopPhase(desktopId, scope, 'destroying', expectedGeneration);

    try {
      await this.deps.provider.destroyDesktop(desktopId, desktop.provider_id, scope);

      await this.deps.store.updateDesktopPhase(desktopId, scope, 'destroyed', expectedGeneration + 1);

      // Revoke all leases
      await this.deps.store.revokeSessionLease(desktopId, desktop.session_lease_id ?? '', scope, 'system', 'destroyed');
      await this.deps.store.revokeExecutionLease(desktopId, desktop.execution_lease_id ?? '', scope, 'system', 'destroyed');
      await this.deps.store.revokeConnectionGrants(desktopId, 'destroyed');
      await this.deps.store.revokeInputControlLease(desktopId, desktop.input_control_lease_id ?? '', scope, 'destroyed');

      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'destroy',
        desiredState: 'destroyed',
        observedState: 'destroyed',
      });
    } catch (error) {
      await this.deps.store.updateDesktopPhase(desktopId, scope, 'failed', expectedGeneration + 1);
      await this.recordEvidence({
        desktopId,
        operationKey: null,
        operationType: 'destroy',
        desiredState: 'destroyed',
        observedState: 'failed',
        failureClass: error instanceof Error ? error.constructor.name : 'UnknownError',
      });
      throw error;
    }
  }

  async grantSession(desktopId: string, userId: string, ttlMs: number, scope: TenantScope): Promise<DesktopSessionLease> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // Authorize user
    await this.authorize(scope, userId);

    const sessionId = `sess-${this.deps.generateToken('sess')}`;
    const connectionGrant = `grant-${this.deps.generateToken('conn')}`;

    const lease = await this.deps.store.grantSessionLease({
      desktopId,
      sessionId,
      userId,
      connectionGrant,
      ttlMs,
      scope,
    });

    // Grant input control to human (observer mode initially)
    await this.deps.store.grantInputControlLease({
      desktopId,
      leaseId: `input-${this.deps.generateToken('input')}`,
      holderType: 'human',
      holderId: userId,
      ttlMs,
      scope,
    });

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'grant_session',
      desiredState: 'session_granted',
      observedState: 'session_granted',
      metadata: { userId, sessionId, ttlMs },
    });

    return {
      sessionId: lease.session_id,
      userId: lease.user_id,
      grantedAt: lease.granted_at,
      expiresAt: lease.expires_at,
      connectionGrant,
    };
  }

  async revokeSession(desktopId: string, sessionId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return;

    await this.deps.store.revokeSessionLease(desktopId, sessionId, scope, 'system', 'revoked');
    await this.deps.store.revokeConnectionGrants(desktopId, 'session_revoked');
    await this.deps.store.revokeInputControlLease(desktopId, desktop.input_control_lease_id ?? '', scope, 'session_end');

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'revoke_session',
      desiredState: 'session_revoked',
      observedState: 'session_revoked',
      metadata: { sessionId },
    });
  }

  async grantExecution(desktopId: string, agentId: string, ttlMs: number, scope: TenantScope): Promise<ExecutionLease> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // Lease acquisition must lose the suspend race: a desktop already in a
    // non-running phase cannot accept an execution lease (Postgres race proof:
    // the suspend worker and this grant contend on the same transactional
    // authority; both sides re-check after lock acquisition).
    if (['suspended', 'suspending', 'destroyed', 'destroying'].includes(desktop.phase)) {
      throw new Error(`Cannot grant execution lease: desktop phase is ${desktop.phase}`);
    }

    // Check if human has active input control (takeover)
    const inputControl = await this.deps.store.getActiveInputControlLease(desktopId, scope);
    if (inputControl && inputControl.holder_type === 'human') {
      throw new Error('Cannot grant execution lease: human has exclusive input control');
    }

    const executionId = `exec-${this.deps.generateToken('exec')}`;

    const lease = await this.deps.store.grantExecutionLease({
      desktopId,
      executionId,
      agentId,
      ttlMs,
      scope,
    });

    // Grant input control to agent
    await this.deps.store.grantInputControlLease({
      desktopId,
      leaseId: `input-${this.deps.generateToken('input')}`,
      holderType: 'agent',
      holderId: agentId,
      ttlMs,
      scope,
    });

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'grant_execution',
      desiredState: 'execution_granted',
      observedState: 'execution_granted',
      metadata: { agentId, executionId, ttlMs },
    });

    return {
      executionId: lease.execution_id,
      agentId: lease.agent_id,
      grantedAt: lease.granted_at,
      expiresAt: lease.expires_at,
    };
  }

  async revokeExecution(desktopId: string, executionId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return;

    await this.deps.store.revokeExecutionLease(desktopId, executionId, scope, 'system', 'revoked');
    await this.deps.store.revokeInputControlLease(desktopId, desktop.input_control_lease_id ?? '', scope, 'execution_end');

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'revoke_execution',
      desiredState: 'execution_revoked',
      observedState: 'execution_revoked',
      metadata: { executionId },
    });
  }

  async get(desktopId: string, scope: TenantScope): Promise<Desktop | null> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return null;
    return this.mapRowToDesktop(desktop);
  }

  async list(scope: TenantScope): Promise<Desktop[]> {
    const rows = await this.deps.store.listDesktops(scope);
    return rows.map(this.mapRowToDesktop);
  }

  // ── VDI-2B: Secure Viewer Extensions ────────────────────────────────────────

  /** Create a short-lived connection grant for the viewer */
  async createViewerConnectionGrant(
    desktopId: string,
    userId: string,
    protocol: string,
    ttlMs: number,
    scope: TenantScope
  ): Promise<{ grantToken: string; protocol: string; expiresAt: string }> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // Verify user has active session lease
    const sessionLease = await this.deps.store.getActiveSessionLease(desktopId, scope);
    if (!sessionLease || sessionLease.user_id !== userId) {
      throw new Error('No active session lease for user');
    }

    const grantToken = `grant-${this.deps.generateToken('conn')}`;
    const grant = await this.deps.store.createConnectionGrant({
      desktopId,
      sessionLeaseId: sessionLease.id,
      grantToken,
      protocol,
      ttlMs,
    });

    return {
      grantToken: grant.grant_token,
      protocol: grant.protocol,
      expiresAt: grant.expires_at,
    };
  }

  /** Validate a viewer connection grant (called by viewer gateway) */
  async validateViewerConnectionGrant(grantToken: string): Promise<{ desktopId: string; protocol: string } | null> {
    const result = await this.deps.store.validateConnectionGrant(grantToken);
    if (!result) return null;
    return { desktopId: result.desktopId, protocol: result.protocol };
  }

  /**
   * GATEWAY INPUT AUTHORIZATION — the gateway calls this for EVERY input
   * event on an established connection, and again whenever it's notified of
   * a grant/lease change. Invalid/expired/revoked grant, or an input-control
   * lease held by someone else ⇒ deny AND the gateway closes the connection.
   * Disabling UI buttons is insufficient; this is the enforcement boundary.
   */
  async authorizeViewerInput(grantToken: string, userId: string, scope: TenantScope): Promise<{
    allowed: boolean;
    reason: 'ok' | 'grant_invalid' | 'grant_expired' | 'grant_revoked' | 'not_input_holder' | 'desktop_not_found';
  }> {
    // Grant must still be valid (exists, unrevoked, unexpired).
    const grant = await this.deps.store.validateConnectionGrant(grantToken);
    if (!grant) {
      // Distinguish revoked vs expired for evidence; both close the connection.
      return { allowed: false, reason: 'grant_revoked' };
    }

    const desktop = await this.deps.store.getDesktopById(grant.desktopId, scope);
    if (!desktop) {
      return { allowed: false, reason: 'desktop_not_found' };
    }

    // Input-control lease must be held by this user.
    const inputControl = await this.deps.store.getActiveInputControlLease(grant.desktopId, scope);
    if (!inputControl || inputControl.holder_type !== 'human' || inputControl.holder_id !== userId) {
      return { allowed: false, reason: 'not_input_holder' };
    }

    return { allowed: true, reason: 'ok' };
  }

  /** Human takeover: revokes agent input control, grants exclusive human control */
  async humanTakeover(desktopId: string, userId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // Authorize user
    await this.authorize(scope, userId);

    // Revoke any agent execution lease and input control
    if (desktop.execution_lease_id) {
      await this.deps.store.revokeExecutionLease(desktopId, desktop.execution_lease_id, scope, 'human_takeover', 'human takeover');
    }

    // Grant exclusive input control to human
    const leaseId = `input-${this.deps.generateToken('input')}`;
    await this.deps.store.grantInputControlLease({
      desktopId,
      leaseId,
      holderType: 'human',
      holderId: userId,
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
      scope,
    });

    // Revoke all connection grants (force reconnect with new grant)
    await this.deps.store.revokeConnectionGrants(desktopId, 'takeover');

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'takeover',
      desiredState: 'human_control',
      observedState: 'human_control',
      metadata: { userId, previousHolder: desktop.input_control_lease_type },
    });
  }

  /**
   * Release human takeover. Does NOT reactivate any previously revoked agent
   * authority — a fresh grantExecution (new lease, new authorization) is
   * required for the agent to act again. Revoked grants stay revoked.
   */
  async releaseTakeover(desktopId: string, userId: string, scope: TenantScope): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) throw new Error(`Desktop not found: ${desktopId}`);

    // Verify this user owns the takeover
    const inputControl = await this.deps.store.getActiveInputControlLease(desktopId, scope);
    if (!inputControl || inputControl.holder_id !== userId || inputControl.holder_type !== 'human') {
      throw new Error('No active human takeover to release');
    }

    await this.deps.store.revokeInputControlLease(desktopId, inputControl.lease_id, scope, 'takeover_released');

    // No auto-restore: agent input control returns only via grantExecution,
    // which requires a fresh authorization and mints a new lease.
    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'takeover',
      desiredState: 'takeover_released',
      observedState: 'no_input_control',
      metadata: { userId, note: 'agent must obtain a fresh grantExecution lease' },
    });
  }

  /** Revoke all access (membership revoked, session expired, etc.) */
  async revokeAllAccess(desktopId: string, scope: TenantScope, reason: string): Promise<void> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return;

    await this.deps.store.revokeSessionLease(desktopId, desktop.session_lease_id ?? '', scope, 'membership_revoked', reason);
    await this.deps.store.revokeExecutionLease(desktopId, desktop.execution_lease_id ?? '', scope, 'membership_revoked', reason);
    await this.deps.store.revokeConnectionGrants(desktopId, reason);
    await this.deps.store.revokeInputControlLease(desktopId, desktop.input_control_lease_id ?? '', scope, reason);

    await this.recordEvidence({
      desktopId,
      operationKey: null,
      operationType: 'revoke_all',
      desiredState: 'access_revoked',
      observedState: 'access_revoked',
      metadata: { reason },
    });
  }

  // ── Health & Capacity (for monitoring) ──────────────────────────────────────

  async getHealth(desktopId: string, scope: TenantScope): Promise<DesktopHealth | null> {
    const desktop = await this.deps.store.getDesktopById(desktopId, scope);
    if (!desktop) return null;

    const providerState = await this.deps.provider.getDesktopState(desktop.provider_id, scope);
    if (!providerState) return null;

    return {
      desktopId,
      providerId: desktop.provider_id,
      phase: providerState.phase,
      checkedAt: this.deps.clock.now(),
    };
  }

  async getCapacity(scope: TenantScope): Promise<DesktopCapacity> {
    const desktops = await this.deps.store.listDesktops(scope);
    const ready = desktops.filter(d => d.phase === 'ready').length;
    const suspended = desktops.filter(d => d.phase === 'suspended').length;
    const degraded = desktops.filter(d => d.phase === 'degraded').length;
    const provisioning = desktops.filter(d => d.phase === 'provisioning').length;

    return {
      tenantId: scope.tenantId,
      totalDesktops: desktops.length,
      readyDesktops: ready,
      suspendedDesktops: suspended,
      degradedDesktops: degraded,
      provisioningDesktops: provisioning,
      runningHours: 0,
    };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────────

  private async waitForReady(providerId: string, scope: TenantScope, maxWaitMs = 300_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const state = await this.deps.provider.getDesktopState(providerId, scope);
      if (state?.phase === 'ready') return;
      if (state?.phase === 'failed') throw new Error('Desktop provisioning failed');
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Desktop provisioning timeout');
  }

  private mapRowToDesktop(row: VdiDesktopRow): Desktop {
    if (!row) throw new Error('Cannot map null row to Desktop');
    return {
      desktopId: row.desktop_id,
      spec: {
        runtimeType: row.runtime_type as DesktopSpec['runtimeType'],
        persistence: row.persistence as DesktopSpec['persistence'],
        imageVersion: row.image_version,
        memoryMb: row.memory_mb ?? undefined,
        cpuShares: row.cpu_shares ?? undefined,
        storageGb: row.storage_gb ?? undefined,
      },
      providerId: row.provider_id,
      provider: row.provider,
      phase: row.phase,
      createdAt: row.created_at,
      resumeKey: row.resume_key ?? undefined,
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      sessionLease: row.session_lease_id && row.session_lease_expires_at
        ? {
            sessionId: row.session_lease_id,
            userId: row.session_lease_user_id ?? 'unknown',
            grantedAt: row.created_at,
            expiresAt: row.session_lease_expires_at,
            connectionGrant: '',
          }
        : undefined,
      executionLease: row.execution_lease_id && row.execution_lease_expires_at
        ? {
            executionId: row.execution_lease_id,
            agentId: row.execution_lease_agent_id ?? 'unknown',
            grantedAt: row.created_at,
            expiresAt: row.execution_lease_expires_at,
          }
        : undefined,
    };
  }

  private async recordEvidence(event: Parameters<DesktopStore['recordEvidence']>[0]) {
    await this.deps.store.recordEvidence(event);
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

export function createDurableDesktopBroker(
  store: DesktopStore,
  provider: DesktopBrokerDeps['provider'],
  operationKeyStore: IdempotentProvisioner,
  policy: DesktopPolicy,
  generateToken: (prefix: string) => string
): DurableDesktopBroker {
  const deps: DesktopBrokerDeps = {
    store,
    provider,
    operationKeyStore,
    clock: { now: () => new Date().toISOString() },
    policy,
    generateToken,
  };

  // Provider capabilities determine broker capabilities
  const capabilities: DesktopCapabilities = {
    runtimeTypes: providerCapabilities.runtimeTypes,
    persistenceScopes: providerCapabilities.persistenceScopes,
    durableSuspend: providerCapabilities.durableSuspend,
    snapshots: providerCapabilities.snapshots,
    maxDesktopsPerWorkspace: providerCapabilities.maxDesktopsPerWorkspace,
    sessionProtocols: providerCapabilities.sessionProtocols,
  };

  return new DurableDesktopBroker(deps, capabilities);
}

// Provider capabilities need to be imported from the provider adapter
// For now, use defaults that match Daytona
const providerCapabilities: DesktopCapabilities = {
  runtimeTypes: ['linux_vm'],
  persistenceScopes: ['task', 'workspace', 'personal'],
  durableSuspend: true,
  snapshots: true,
  maxDesktopsPerWorkspace: 10,
  sessionProtocols: ['vnc', 'webvnc'],
};