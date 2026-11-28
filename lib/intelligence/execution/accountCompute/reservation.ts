// Account Compute Plane — Slice A1: durable account reservation.
//
// Server-side only. Claims a VM row before any provider call, binds
// workspaces to the account VM, and resolves provisioning outcomes.
// No provider secrets or URLs leak through these functions.

import { supabaseAdmin } from '@/lib/supabaseClient';
import type {
  AccountComputeEntitlement,
} from '@/lib/intelligence/execution/accountCompute/contracts';

export const ENABLE_ACCOUNT_COMPUTE = process.env.ENABLE_ACCOUNT_COMPUTE === 'true';

export interface AccountVmClaim {
  claimed: boolean;
  replay: boolean;
  vmId: string;
  desktopId: string | null;
  providerId: string | null;
  state: string;
  generation: number;
  operationKey: string;
}

export interface WorkspaceAttach {
  attached: boolean;
  replay: boolean;
  workspaceId: string;
  computeNamespace: string;
  generation: number;
}

export interface ProvisioningResult {
  ok: boolean;
  reason?: string;
  generation?: number;
  state?: string;
}

function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Account compute requires service-role Supabase client');
  }
  return supabaseAdmin;
}

/**
 * Claim an account VM before any provider create. Idempotent: replaying the
 * same owner returns the existing claim. UNIQUE(owner_user_id) prevents
 * duplicate VMs under concurrent claims.
 */
export async function claimAccountVm(
  ownerUserId: string,
  operationKey: string,
  vmClass: string,
  entitlement: AccountComputeEntitlement
): Promise<AccountVmClaim> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_claim_vm', {
    p_owner_user_id: ownerUserId,
    p_operation_key: operationKey,
    p_vm_class: vmClass,
    p_entitlement: entitlement,
  });

  if (error) throw error;

  return {
    claimed: data.claimed,
    replay: data.replay,
    vmId: data.vm_id,
    desktopId: data.desktop_id ?? null,
    providerId: data.provider_id ?? null,
    state: data.state,
    generation: data.generation,
    operationKey: data.operation_key,
  };
}

/**
 * Mark a claimed VM as ready (desktop_id/provider_id set). Generation CAS
 * prevents stale writers from overwriting a newer state.
 */
export async function markVmReady(
  ownerUserId: string,
  desktopId: string,
  providerId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_mark_ready', {
    p_owner_user_id: ownerUserId,
    p_desktop_id: desktopId,
    p_provider_id: providerId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/**
 * Mark a claimed VM as suspended. Generation CAS prevents stale writers from
 * overwriting a newer state. Never writes state='ready'.
 */
export async function markVmSuspended(
  ownerUserId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_mark_suspended', {
    p_owner_user_id: ownerUserId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/**
 * Mark a claimed VM as failed (retained for reconciliation, never auto-released).
 */
export async function markVmFailed(
  ownerUserId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_mark_failed', {
    p_owner_user_id: ownerUserId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/**
 * Attach a workspace to the account VM. Idempotent: replaying the same
 * binding returns the existing attachment. Composite UNIQUE prevents
 * duplicate bindings under concurrent attach.
 */
export async function attachWorkspaceToVm(
  ownerUserId: string,
  workspaceId: string,
  computeNamespace: string,
  expectedGeneration?: number
): Promise<WorkspaceAttach> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_attach_workspace', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_compute_namespace: computeNamespace,
    p_expected_generation: expectedGeneration ?? null,
  });

  if (error) throw error;

  return {
    attached: data.attached,
    replay: data.replay,
    workspaceId: data.workspace_id,
    computeNamespace: data.compute_namespace,
    generation: data.generation,
  };
}

/**
 * Detach a workspace from the account VM (soft: status detached). Generation CAS.
 */
export async function detachWorkspaceFromVm(
  ownerUserId: string,
  workspaceId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_detach_workspace', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/**
 * Resolve a provisioning outcome. 'uncertain' retains the row for
 * reconciliation (never auto-released). 'failed' records the failure.
 */
export async function resolveProvisioning(
  ownerUserId: string,
  outcome: 'uncertain' | 'failed',
  now: string
): Promise<ProvisioningResult> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_resolve_provisioning', {
    p_owner_user_id: ownerUserId,
    p_outcome: outcome,
    p_now: now,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    reason: data.reason ?? undefined,
    generation: data.generation ?? undefined,
    state: data.state ?? undefined,
  };
}

/**
 * Read the current VM claim for an account (user-scoped RLS read).
 */
export async function getAccountVm(ownerUserId: string) {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('account_compute_vms')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Read workspace bindings for an account (user-scoped RLS read).
 */
export async function getWorkspaceBindings(ownerUserId: string) {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('account_compute_workspaces')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'active');

  if (error) throw error;
  return data ?? [];
}

/** Durable guest record. */
export interface GuestRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly workspaceId: string;
  readonly providerId: string | null;
  readonly phase: string;
  readonly generation: number;
  readonly operationKey: string;
  readonly errorReason: string | null;
  readonly quarantined: boolean;
}

/** Guest lease with fencing token. */
export interface GuestLease {
  readonly fencingToken: string;
  readonly generation: number;
  readonly expiresAt: string;
  readonly replay: boolean;
}

/** Claim (register) a durable guest record for an account+workspace.
 *  Requires the account VM to exist and be ready. Creates the initial guest
 *  row in phase='creating' with generation=1. Idempotent. */
export async function claimGuest(
  ownerUserId: string,
  workspaceId: string,
  operationKey: string
): Promise<{ ok: boolean; record?: GuestRecord; generation?: number; reason?: string; replay?: boolean }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_claim_guest', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_operation_key: operationKey,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    replay: data.replay ?? false,
    record: data.ok
      ? {
          id: data.id,
          ownerUserId: data.owner_user_id,
          workspaceId: data.workspace_id,
          providerId: data.provider_id ?? null,
          phase: data.phase,
          generation: data.generation ?? undefined,
          operationKey: data.operation_key,
          errorReason: data.error_reason ?? null,
          quarantined: data.quarantined ?? false,
        }
      : undefined,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Acquire an exclusive execution lease for a guest. Fails if the VM is
 * suspending (account-wide fence) or the caller's generation is stale. */
export async function acquireGuestLease(
  ownerUserId: string,
  workspaceId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; lease?: GuestLease; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_acquire_guest_lease', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    lease: data.ok
      ? {
          fencingToken: data.fencing_token,
          generation: data.generation ?? undefined,
          expiresAt: data.expires_at ?? undefined,
          replay: data.replay ?? false,
        }
      : undefined,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Release a guest execution lease by fencing token. */
export async function releaseGuestLease(
  ownerUserId: string,
  workspaceId: string,
  fencingToken: string
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_release_guest_lease', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_fencing_token: fencingToken,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Extend a guest execution lease expiry by p_extend_ms milliseconds. */
export async function extendGuestLease(
  ownerUserId: string,
  workspaceId: string,
  fencingToken: string,
  extendMs: number
): Promise<{ ok: boolean; expiresAt?: string; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_extend_guest_lease', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_fencing_token: fencingToken,
    p_extend_ms: extendMs,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    expiresAt: data.expires_at ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Transition a guest phase with generation CAS. */
export async function markGuestPhase(
  ownerUserId: string,
  workspaceId: string,
  expectedGeneration: number,
  newPhase: string,
  providerId?: string
): Promise<{ ok: boolean; generation?: number; phase?: string; quarantined?: boolean; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_mark_guest_phase', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_expected_generation: expectedGeneration,
    p_new_phase: newPhase,
    p_provider_id: providerId ?? null,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    phase: data.phase ?? undefined,
    quarantined: data.quarantined ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Account-wide ready -> suspending fence. Prevents new guest leases while
 * the VM is suspending. */
export async function suspendAccountVm(
  ownerUserId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; state?: string; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_suspend_account_vm', {
    p_owner_user_id: ownerUserId,
    p_expected_generation: expectedGeneration,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    generation: data.generation ?? undefined,
    state: data.state ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Resolve a guest provisioning outcome. 'uncertain' retains the row in
 * error/quarantine for reconciliation; 'failed' records the failure. */
export async function resolveGuestProvisioning(
  ownerUserId: string,
  workspaceId: string,
  outcome: 'uncertain' | 'failed',
  now: string
): Promise<{ ok: boolean; phase?: string; generation?: number; quarantined?: boolean; reason?: string }> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb.rpc('account_compute_resolve_guest_provisioning', {
    p_owner_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_outcome: outcome,
    p_now: now,
  });

  if (error) throw error;

  return {
    ok: data.ok,
    phase: data.phase ?? undefined,
    generation: data.generation ?? undefined,
    quarantined: data.quarantined ?? undefined,
    reason: data.reason ?? undefined,
  };
}

/** Read the durable guest record for an owner+workspace (user-scoped RLS read). */
export async function getGuestRecord(
  ownerUserId: string,
  workspaceId: string
): Promise<GuestRecord | null> {
  const sb = requireSupabaseAdmin();
  const { data, error } = await sb
    .from('account_compute_guests')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    ownerUserId: data.owner_user_id,
    workspaceId: data.workspace_id,
    providerId: data.provider_id ?? null,
    phase: data.phase,
    generation: data.generation,
    operationKey: data.operation_key,
    errorReason: data.error_reason ?? null,
    quarantined: data.quarantined,
  };
}

