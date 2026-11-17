// Account Compute Plane — Slice A3.1: guest workspace supervisor.
//
// Manages isolated guest environments inside the account VM. Every operation
// is bound to an exclusive, generation-fenced lease. Atomic ready →
// suspending → suspended transitions prevent new lease acquisition during
// suspension, closing the check-then-act race in A2.1.
//
// No runtime isolation is claimed here — A3.3 verifies that inside a real
// Linux VM. The provider is injected and mocked in tests.
//
// # ponytail: in-memory, per-instance state. Cross-instance exclusivity and
//   restart durability require durable DB leases (A3.4).

import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export interface GuestLease {
  readonly ownerUserId: string;
  readonly workspaceId: string;
  readonly generation: number;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export type GuestPhase =
  | 'creating'
  | 'running'
  | 'suspending'
  | 'suspended'
  | 'destroyed'
  | 'error';

export interface GuestState {
  readonly ownerUserId: string;
  readonly workspaceId: string;
  readonly phase: GuestPhase;
  readonly desktopId: string | null;
  readonly generation: number;
}

export interface GuestProvider {
  readonly id: string;
  createGuest(workspaceId: string, namespace: string, scope: TenantScope): Promise<{
    desktopId: string;
  }>;
  startGuest(desktopId: string, scope: TenantScope): Promise<void>;
  suspendGuest(desktopId: string, scope: TenantScope): Promise<void>;
  destroyGuest(desktopId: string, scope: TenantScope): Promise<void>;
  healthGuest(desktopId: string, scope: TenantScope): Promise<{ healthy: boolean }>;
  inspectGuest(
    desktopId: string,
    scope: TenantScope,
  ): Promise<{ phase: GuestPhase; generation: number } | null>;
}

export interface GuestSupervisorConfig {
  maxConcurrentGuests: number;
  leaseTtlMs: number;
}

type Key = `${string}:${string}`;
function leaseKey(ownerUserId: string, workspaceId: string): Key {
  return `${ownerUserId}:${workspaceId}`;
}

/**
 * In-memory lease/state supervisor. Keyed by owner+workspace so two users
 * sharing a workspace never collide — each owns a separate guest on their
 * own account VM. A3.4+ replaces this with durable DB leases.
 */
export class GuestSupervisor {
  private leases = new Map<Key, GuestLease>();
  private states = new Map<Key, GuestState>();

  constructor(
    readonly provider: GuestProvider,
    readonly config: GuestSupervisorConfig,
  ) {}

  private nowMs(): number {
    return Date.now();
  }

  private isLeaseActive(lease: GuestLease | undefined): boolean {
    if (!lease) return false;
    return new Date(lease.expiresAt) > new Date();
  }

  private activeCount(ownerUserId: string): number {
    let count = 0;
    for (const [key, lease] of this.leases) {
      if (this.isLeaseActive(lease) && lease.ownerUserId === ownerUserId) {
        count += 1;
      }
    }
    return count;
  }

  /** Acquire an exclusive, generation-fenced lease. Fails if the VM is suspending. */
  acquireLease(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): { ok: boolean; lease?: GuestLease; generation?: number; reason?: string } {
    const key = leaseKey(ownerUserId, workspaceId);
    const existing = this.leases.get(key);
    if (existing && this.isLeaseActive(existing)) {
      return { ok: false, reason: 'lease held', generation: existing.generation };
    }

    const state = this.states.get(key);
    if (state && state.phase === 'suspending') {
      return { ok: false, reason: 'vm suspending', generation: state.generation };
    }
    if (state && state.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: state.generation };
    }

    if (this.activeCount(ownerUserId) >= this.config.maxConcurrentGuests) {
      return { ok: false, reason: 'quota exhausted' };
    }

    const now = new Date();
    const lease: GuestLease = {
      ownerUserId,
      workspaceId,
      generation: (state?.generation ?? 0) + 1,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.leaseTtlMs).toISOString(),
    };
    this.leases.set(key, lease);
    return { ok: true, lease, generation: lease.generation };
  }

  /** Release a lease by owner+workspace. */
  releaseLease(ownerUserId: string, workspaceId: string): void {
    this.leases.delete(leaseKey(ownerUserId, workspaceId));
  }

  /** Get current lease for an owner+workspace (undefined if none or expired). */
  getLease(ownerUserId: string, workspaceId: string): GuestLease | undefined {
    const key = leaseKey(ownerUserId, workspaceId);
    const lease = this.leases.get(key);
    if (!lease || !this.isLeaseActive(lease)) {
      this.leases.delete(key);
      return undefined;
    }
    return lease;
  }

  /** Get current guest state for an owner+workspace. */
  getState(ownerUserId: string, workspaceId: string): GuestState | undefined {
    return this.states.get(leaseKey(ownerUserId, workspaceId));
  }

  /** Create a guest environment for a workspace. Generation-fenced. */
  async createWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    namespace: string,
    scope: TenantScope,
    expectedGeneration: number,
  ): Promise<{
    ok: boolean;
    state?: GuestState;
    generation?: number;
    reason?: string;
  }> {
    const acquired = this.acquireLease(ownerUserId, workspaceId, expectedGeneration);
    if (!acquired.ok) {
      return { ok: false, reason: acquired.reason, generation: acquired.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const existing = this.states.get(key);
    if (existing && existing.phase !== 'destroyed' && existing.phase !== 'error') {
      this.releaseLease(ownerUserId, workspaceId);
      return {
        ok: false,
        reason: 'guest exists',
        generation: existing.generation,
      };
    }

    try {
      const created = await this.provider.createGuest(workspaceId, namespace, scope);
      const generation = acquired.generation!;
      const state: GuestState = {
        ownerUserId,
        workspaceId,
        phase: 'running',
        desktopId: created.desktopId,
        generation,
      };
      this.states.set(key, state);
      return { ok: true, state, generation };
    } catch (error) {
      this.releaseLease(ownerUserId, workspaceId);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'create failed',
        generation: acquired.generation,
      };
    }
  }

  /** Start a suspended guest. Requires an active lease. */
  async startWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    scope: TenantScope,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestState; generation?: number; reason?: string }> {
    const lease = this.getLease(ownerUserId, workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (!state || state.phase !== 'suspended') {
      return {
        ok: false,
        reason: state ? `guest not suspended (${state.phase})` : 'no guest',
        generation: state?.generation ?? expectedGeneration,
      };
    }

    try {
      await this.provider.startGuest(state.desktopId!, scope);
      const updated: GuestState = { ...state, phase: 'running', generation: lease.generation };
      this.states.set(key, updated);
      return { ok: true, state: updated, generation: updated.generation };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'start failed',
        generation: state?.generation ?? expectedGeneration,
      };
    }
  }

  /** Suspend a running guest. Atomic ready → suspending → suspended transition. */
  async suspendWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    scope: TenantScope,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestState; generation?: number; reason?: string }> {
    const lease = this.getLease(ownerUserId, workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (!state || state.phase !== 'running') {
      return {
        ok: false,
        reason: state ? `guest not running (${state.phase})` : 'no guest',
        generation: state?.generation ?? expectedGeneration,
      };
    }

    // Atomic: mark suspending before touching the provider. Blocks new leases.
    const suspending: GuestState = { ...state, phase: 'suspending', generation: lease.generation };
    this.states.set(key, suspending);

    try {
      await this.provider.suspendGuest(state.desktopId!, scope);
      const suspended: GuestState = { ...state, phase: 'suspended', generation: lease.generation };
      this.states.set(key, suspended);
      return { ok: true, state: suspended, generation: suspended.generation };
    } catch (error) {
      // Rollback: back to running so the guest remains usable.
      this.states.set(key, state);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'suspend failed',
        generation: state.generation,
      };
    }
  }

  /**
   * Destroy a guest and release its lease. Requires an active lease.
   * If the provider destroy fails, the guest is quarantined in 'error' state
   * for reconciliation instead of being silently dropped.
   */
  async destroyWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; generation?: number; reason?: string }> {
    const lease = this.getLease(ownerUserId, workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (state && state.desktopId) {
      try {
        await this.provider.destroyGuest(state.desktopId, scope(ownerUserId, workspaceId));
      } catch (error) {
        // Quarantine: retain the record so a reconcile can retry or clean up.
        const errored: GuestState = { ...state, phase: 'error' };
        this.states.set(key, errored);
        return {
          ok: false,
          reason: error instanceof Error ? error.message : 'destroy failed',
          generation: state.generation,
        };
      }
    }

    this.states.delete(key);
    this.releaseLease(ownerUserId, workspaceId);
    return { ok: true, generation: lease.generation };
  }

  /** Reconcile a quarantined guest back to a known state. Idempotent. */
  async reconcileWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
  ): Promise<{ ok: boolean; state?: GuestState; reason?: string }> {
    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (!state) {
      return { ok: true }; // nothing to reconcile
    }
    if (state.phase !== 'error' && state.phase !== 'destroyed') {
      return { ok: true, state };
    }

    const desktopId = state.desktopId;
    let healthy = false;
    if (desktopId) {
      try {
        const probe = await this.provider.healthGuest(desktopId, scope(ownerUserId, workspaceId));
        healthy = probe.healthy;
      } catch {
        healthy = false;
      }
    }

    const reconciled: GuestState = {
      ...state,
      phase: healthy ? 'running' : 'error',
      generation: state.generation,
    };
    this.states.set(key, reconciled);
    return { ok: true, state: reconciled };
  }

  /** Health check for a guest. Requires an active lease. */
  async healthWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; healthy?: boolean; generation?: number; reason?: string }> {
    const lease = this.getLease(ownerUserId, workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (!state || !state.desktopId) {
      return {
        ok: false,
        reason: 'no guest',
        generation: state?.generation ?? expectedGeneration,
      };
    }

    try {
      const healthy = await this.provider.healthGuest(state.desktopId, scope(ownerUserId, workspaceId));
      return { ok: true, healthy: healthy.healthy, generation: state.generation };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'health check failed',
        generation: state.generation,
      };
    }
  }

  /** Inspect a guest. Requires an active lease. */
  async inspectWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; state?: GuestState; generation?: number; reason?: string }> {
    const lease = this.getLease(ownerUserId, workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const key = leaseKey(ownerUserId, workspaceId);
    const state = this.states.get(key);
    if (!state) {
      return { ok: false, reason: 'no guest', generation: expectedGeneration };
    }
    return { ok: true, state, generation: state.generation };
  }
}

function scope(ownerUserId: string, workspaceId: string): TenantScope {
  return { tenantId: 'user:' + ownerUserId, workspaceId };
}
