// Account Compute Plane — A3.4: durable guest state and execution leases.
//
// DB-backed lease and phase state; provider is called directly for VM
// operations. The database is the source of truth. Provider operations never
// execute before successful durable CAS; provider calls are not transactional
// and are gated by an idempotent fencing token + generation CAS.
//
// Account-wide suspension: suspendWorkspaceGuest first fences the VM via
// suspendAccountVm (ready -> suspending), which refuses new leases, then
// transitions each guest to suspended. Resume reverses the order.
//
// # ponytail: per-request DB round-trips for lease/phase. Batch lease renewal
//   and background reconciler are A3.5+ concerns.

import {
  claimGuest,
  acquireGuestLease,
  releaseGuestLease,
  extendGuestLease,
  markGuestPhase,
  suspendAccountVm as dbSuspendAccountVm,
  resolveGuestProvisioning,
  getGuestRecord,
  type GuestRecord,
  type GuestLease,
} from '@/lib/intelligence/execution/accountCompute/reservation';
import type { GuestProvider, GuestPhase } from '@/lib/intelligence/execution/accountCompute/guest';
import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export interface DurableGuestSupervisorConfig {
  maxConcurrentGuests: number;
  leaseTtlMs: number;
  leaseRenewalMs: number;
}

/**
 * Durable guest supervisor. Every operation:
 *   1. Reads/creates the durable guest record (getGuestRecord / markGuestPhase)
 *   2. Acquires an exclusive, generation-fenced lease (acquireGuestLease)
 *   3. Executes the provider operation directly
 *   4. Transitions phase (markGuestPhase) or quarantines on failure
 */
export class DurableGuestSupervisor {
  constructor(
    readonly provider: GuestProvider,
    readonly config: DurableGuestSupervisorConfig,
  ) {}

  /** Resolve the durable guest record for an owner+workspace. */
  private async resolveRecord(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<GuestRecord | null> {
    return getGuestRecord(ownerUserId, workspaceId);
  }

  /** Acquire an exclusive lease. Fails if the VM is suspending or generation is stale. */
  async acquireLease(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; fencingToken?: string; generation?: number; reason?: string }> {
    const result = await acquireGuestLease(ownerUserId, workspaceId, expectedGeneration);
    return {
      ok: result.ok,
      fencingToken: result.lease?.fencingToken,
      generation: result.generation,
      reason: result.reason,
    };
  }

  /** Release a lease by fencing token. */
  async releaseLease(
    ownerUserId: string,
    workspaceId: string,
    fencingToken: string,
  ): Promise<{ ok: boolean; generation?: number; reason?: string }> {
    return releaseGuestLease(ownerUserId, workspaceId, fencingToken);
  }

  /** Extend a lease expiry. Requires a valid fencing token. */
  async extendLease(
    ownerUserId: string,
    workspaceId: string,
    fencingToken: string,
    extendMs: number,
  ): Promise<{ ok: boolean; expiresAt?: string; reason?: string }> {
    return extendGuestLease(ownerUserId, workspaceId, fencingToken, extendMs);
  }

  /** Create a guest environment. Durable record first, provider create second. */
  async createWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    namespace: string,
    scope: TenantScope,
    expectedGeneration: number,
  ): Promise<{
    ok: boolean;
    state?: GuestRecord;
    generation?: number;
    reason?: string;
  }> {
    const existing = await getGuestRecord(ownerUserId, workspaceId);
    if (existing && existing.phase !== 'destroyed' && existing.phase !== 'error') {
      return { ok: false, reason: 'guest exists', generation: existing.generation };
    }

    // Claim (register) the durable guest record first.
    const claimed = await claimGuest(ownerUserId, workspaceId, `${ownerUserId}:${workspaceId}:claim`);
    if (!claimed.ok) {
      return { ok: false, reason: claimed.reason, generation: claimed.generation };
    }
    const guestGen = claimed.generation ?? 1;

    // Acquire an exclusive lease before any provider call. The RPC checks the
    // account VM state (ready, not suspending) under the VM lock.
    const acquired = await this.acquireLease(ownerUserId, workspaceId, guestGen);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    // Phase: creating (guest generation CAS before provider).
    const creating = await markGuestPhase(
      ownerUserId, workspaceId, guestGen, 'creating',
    );
    if (!creating.ok) {
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return { ok: false, reason: creating.reason, generation: creating.generation };
    }

    let createdGen = creating.generation ?? guestGen + 1;
    try {
      await this.provider.createGuest(workspaceId, namespace, scope);

      // Phase: running (guest generation CAS after successful provider create).
      const running = await markGuestPhase(
        ownerUserId, workspaceId, createdGen, 'running',
      );
      if (!running.ok) {
        await resolveGuestProvisioning(ownerUserId, workspaceId, 'uncertain', new Date().toISOString());
        await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
        return { ok: false, reason: running.reason ?? 'phase transition failed', generation: running.generation };
      }

      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      const finalRecord = await getGuestRecord(ownerUserId, workspaceId);
      return { ok: true, state: finalRecord ?? undefined, generation: running.generation };
    } catch (error) {
      await markGuestPhase(ownerUserId, workspaceId, createdGen, 'error');
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'create failed',
        generation: createdGen,
      };
    }
  }

  /** Start a suspended guest. Requires an active lease and a running-capable VM. */
  async startWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    scope: TenantScope,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestRecord; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record) {
      return { ok: false, reason: 'no guest', generation: expectedGeneration };
    }
    if (record.phase !== 'suspended') {
      return { ok: false, reason: `guest not suspended (${record.phase})`, generation: record.generation };
    }

    const acquired = await this.acquireLease(ownerUserId, workspaceId, record.generation);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    try {
      await this.provider.startGuest(record.providerId!, scope);

      const running = await markGuestPhase(
        ownerUserId, workspaceId, record.generation, 'running',
      );
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      const finalRecord = await getGuestRecord(ownerUserId, workspaceId);
      return {
        ok: running.ok ? true : false,
        state: running.ok ? (finalRecord ?? undefined) : undefined,
        generation: running.generation,
        reason: running.ok ? undefined : running.reason,
      };
    } catch (error) {
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return { ok: false, reason: error instanceof Error ? error.message : 'start failed', generation: record.generation };
    }
  }

  /** Suspend a guest. Account-wide fence first (VM ready -> suspending, VM
   * generation), then per-guest suspending -> suspended (guest generation).
   * New leases are refused during the fence. */
  async suspendWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    scope: TenantScope,
    expectedVmGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestRecord; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record) {
      return { ok: false, reason: 'no guest', generation: expectedVmGeneration };
    }
    if (record.phase !== 'running') {
      return { ok: false, reason: `guest not running (${record.phase})`, generation: record.generation };
    }

    // Account-wide suspension fence: ready -> suspending (VM generation).
    // Rejects if any active guest lease exists under this account lock.
    const fenced = await dbSuspendAccountVm(ownerUserId, expectedVmGeneration);
    if (!fenced.ok) {
      return { ok: false, reason: fenced.reason ?? 'suspend fence failed', generation: fenced.generation };
    }

    // Transition guest to suspending (guest generation). No new lease is
    // acquired after the fence: the VM is now 'suspending', so
    // acquireGuestLease would refuse. The fence itself holds the account lock.
    const suspending = await markGuestPhase(
      ownerUserId, workspaceId, record.generation, 'suspending',
    );
    if (!suspending.ok) {
      return { ok: false, reason: suspending.reason, generation: suspending.generation };
    }

    try {
      await this.provider.suspendGuest(record.providerId!, scope);

      const phase = await markGuestPhase(
        ownerUserId, workspaceId, suspending.generation ?? record.generation, 'suspended',
      );
      const finalRecord = await getGuestRecord(ownerUserId, workspaceId);
      return {
        ok: phase.ok ? true : false,
        state: phase.ok ? (finalRecord ?? undefined) : undefined,
        generation: phase.generation,
        reason: phase.ok ? undefined : phase.reason,
      };
    } catch (error) {
      // Rollback: back to running so the guest remains usable.
      await markGuestPhase(ownerUserId, workspaceId, suspending.generation ?? record.generation, 'running');
      return { ok: false, reason: error instanceof Error ? error.message : 'suspend failed', generation: record.generation };
    }
  }

  /** Destroy a guest and release its lease. Provider failure quarantines. */
  async destroyWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record) {
      return { ok: false, reason: 'no guest', generation: expectedGeneration };
    }

    const acquired = await this.acquireLease(ownerUserId, workspaceId, record.generation);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    try {
      if (record.providerId) {
        await this.provider.destroyGuest(record.providerId, scope(ownerUserId, workspaceId));
      }

      await markGuestPhase(ownerUserId, workspaceId, acquired.generation ?? record.generation, 'destroyed');
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return { ok: true, generation: acquired.generation ?? record.generation };
    } catch (error) {
      await markGuestPhase(ownerUserId, workspaceId, acquired.generation ?? record.generation, 'error');
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return { ok: false, reason: error instanceof Error ? error.message : 'destroy failed', generation: record.generation };
    }
  }

  /** Health check. Requires an active lease. */
  async healthWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; healthy?: boolean; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record || !record.providerId) {
      return { ok: false, reason: 'no guest', generation: record?.generation ?? expectedGeneration };
    }

    const acquired = await this.acquireLease(ownerUserId, workspaceId, record.generation);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    try {
      const health = await this.provider.healthGuest(record.providerId, scope(ownerUserId, workspaceId));
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return {
        ok: true,
        healthy: health.healthy,
        generation: record.generation,
        reason: undefined,
      };
    } catch (error) {
      await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
      return { ok: false, reason: error instanceof Error ? error.message : 'health check failed', generation: record.generation };
    }
  }

  /** Inspect durable guest state. Requires an active lease. */
  async inspectWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestRecord; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record) {
      return { ok: false, reason: 'no guest', generation: expectedGeneration };
    }
    if (record.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: record.generation };
    }

    const acquired = await this.acquireLease(ownerUserId, workspaceId, record.generation);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    await this.releaseLease(ownerUserId, workspaceId, acquired.fencingToken!);
    const current = await getGuestRecord(ownerUserId, workspaceId);
    return { ok: true, state: current ?? record, generation: current?.generation ?? record.generation };
  }

  /** Reconcile a quarantined or interrupted guest. Idempotent. Reads durable
   * state, probes the provider, and transitions to running or retains error. */
  async reconcileWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ ok: boolean; state?: GuestRecord; generation?: number; reason?: string }> {
    const record = await this.resolveRecord(ownerUserId, workspaceId);
    if (!record) {
      return { ok: true };
    }
    if (record.phase !== 'error' && record.phase !== 'destroyed') {
      return { ok: true, state: record, generation: record.generation };
    }

    const scope = { tenantId: 'user:' + ownerUserId, workspaceId };
    let healthy = false;
    if (record.providerId) {
      try {
        const probe = await this.provider.healthGuest(record.providerId, scope);
        healthy = probe.healthy === true;
      } catch {
        healthy = false;
      }
    }

    const phase = await markGuestPhase(
      ownerUserId, workspaceId, record.generation, healthy ? 'running' : 'error',
    );
    if (!phase.ok) {
      return { ok: false, reason: phase.reason ?? 'reconcile phase failed', generation: record.generation };
    }

    const finalRecord = await getGuestRecord(ownerUserId, workspaceId);
    return { ok: true, state: finalRecord ?? record, generation: phase.generation };
  }
}

function scope(ownerUserId: string, workspaceId: string): TenantScope {
  return { tenantId: 'user:' + ownerUserId, workspaceId };
}
