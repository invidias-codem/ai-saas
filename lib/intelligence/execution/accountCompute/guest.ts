// Account Compute Plane — Slice A3.1: guest workspace supervisor.
//
// Manages isolated guest environments inside the account VM. Every operation
// is bound to an exclusive, generation-fenced lease. Atomic ready →
// suspending → suspended transitions prevent new lease acquisition during
// suspension, closing the check-then-act race in A2.1.
//
// No runtime isolation is claimed here — A3.3 verifies that inside a real
// Linux VM. The provider is injected and mocked in tests.

import type { TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export interface GuestLease {
  readonly workspaceId: string;
  readonly ownerUserId: string;
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

/**
 * In-memory lease/state supervisor. A3.4+ replaces this with durable DB leases.
 * Operations are generation-fenced and fail closed on any precondition error.
 */
export class GuestSupervisor {
  private leases = new Map<string, GuestLease>(); // workspaceId -> lease
  private states = new Map<string, GuestState>(); // workspaceId -> state
  private desktops = new Map<string, string>(); // workspaceId -> desktopId

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

  /** Acquire an exclusive, generation-fenced lease. Fails if the VM is suspending. */
  acquireLease(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): { ok: boolean; lease?: GuestLease; generation?: number; reason?: string } {
    const existing = this.leases.get(workspaceId);
    if (existing && this.isLeaseActive(existing)) {
      return { ok: false, reason: 'lease held', generation: existing.generation };
    }

    const state = this.states.get(workspaceId);
    if (state && state.phase === 'suspending') {
      return { ok: false, reason: 'vm suspending', generation: state.generation };
    }
    if (state && state.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: state.generation };
    }

    const activeCount = Array.from(this.leases.values()).filter((l) =>
      this.isLeaseActive(l),
    ).length;
    if (activeCount >= this.config.maxConcurrentGuests) {
      return { ok: false, reason: 'quota exhausted' };
    }

    const now = new Date();
    const lease: GuestLease = {
      workspaceId,
      ownerUserId,
      generation: (state?.generation ?? 0) + 1,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.leaseTtlMs).toISOString(),
    };
    this.leases.set(workspaceId, lease);
    return { ok: true, lease, generation: lease.generation };
  }

  /** Release a lease by workspace. */
  releaseLease(workspaceId: string): void {
    this.leases.delete(workspaceId);
  }

  /** Get current lease for a workspace (undefined if none or expired). */
  getLease(workspaceId: string): GuestLease | undefined {
    const lease = this.leases.get(workspaceId);
    if (!lease || !this.isLeaseActive(lease)) {
      this.leases.delete(workspaceId);
      return undefined;
    }
    return lease;
  }

  /** Get current guest state. */
  getState(workspaceId: string): GuestState | undefined {
    return this.states.get(workspaceId);
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

    const existing = this.states.get(workspaceId);
    if (existing && existing.phase !== 'destroyed') {
      this.releaseLease(workspaceId);
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
        workspaceId,
        phase: 'running',
        desktopId: created.desktopId,
        generation,
      };
      this.states.set(workspaceId, state);
      this.desktops.set(workspaceId, created.desktopId);
      return { ok: true, state, generation };
    } catch (error) {
      this.releaseLease(workspaceId);
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
    const lease = this.getLease(workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const state = this.states.get(workspaceId);
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
      this.states.set(workspaceId, updated);
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
    const lease = this.getLease(workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const state = this.states.get(workspaceId);
    if (!state || state.phase !== 'running') {
      return {
        ok: false,
        reason: state ? `guest not running (${state.phase})` : 'no guest',
        generation: state?.generation ?? expectedGeneration,
      };
    }

    // Atomic: mark suspending before touching the provider. Blocks new leases.
    const suspending: GuestState = { ...state, phase: 'suspending', generation: lease.generation };
    this.states.set(workspaceId, suspending);

    try {
      await this.provider.suspendGuest(state.desktopId!, scope);
      const suspended: GuestState = { ...state, phase: 'suspended', generation: lease.generation };
      this.states.set(workspaceId, suspended);
      return { ok: true, state: suspended, generation: suspended.generation };
    } catch (error) {
      // Rollback: back to running so the guest remains usable.
      this.states.set(workspaceId, state);
      return {
        ok: false,
        reason: error instanceof Error ? error.message : 'suspend failed',
        generation: state.generation,
      };
    }
  }

  /** Destroy a guest and release its lease. Requires an active lease. */
  async destroyWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; generation?: number; reason?: string }> {
    const lease = this.getLease(workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const state = this.states.get(workspaceId);
    if (state && state.desktopId) {
      try {
        await this.provider.destroyGuest(state.desktopId, scope(ownerUserId, workspaceId));
      } catch {
        // Destroy is best-effort; proceed to clear local state.
      }
    }

    this.states.delete(workspaceId);
    this.desktops.delete(workspaceId);
    this.releaseLease(workspaceId);
    return { ok: true, generation: lease.generation };
  }

  /** Health check for a guest. Requires an active lease. */
  async healthWorkspaceGuest(
    ownerUserId: string,
    workspaceId: string,
    expectedGeneration: number,
  ): Promise<{ ok: boolean; healthy?: boolean; generation?: number; reason?: string }> {
    const lease = this.getLease(workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const state = this.states.get(workspaceId);
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
    const lease = this.getLease(workspaceId);
    if (!lease || lease.ownerUserId !== ownerUserId) {
      return { ok: false, reason: 'no active lease', generation: expectedGeneration };
    }
    if (lease.generation !== expectedGeneration) {
      return { ok: false, reason: 'stale generation', generation: lease.generation };
    }

    const state = this.states.get(workspaceId);
    if (!state) {
      return { ok: false, reason: 'no guest', generation: expectedGeneration };
    }
    return { ok: true, state, generation: state.generation };
  }
}

function scope(ownerUserId: string, workspaceId: string): TenantScope {
  return { tenantId: 'user:' + ownerUserId, workspaceId };
}
