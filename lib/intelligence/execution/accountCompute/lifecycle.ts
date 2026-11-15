// Account Compute Plane — Slice A2: VM lifecycle orchestration.
//
// Orchestrates provision / suspend / resume / attach / detach by combining
// A1 durable reservations with a Daytona provider adapter. All mutations are
// generation-fenced; no provider secrets or URLs leak through this module.
//
// Injected dependencies make the module testable without a live Daytona org.

import {
  AccountVmProviderCapabilities,
  accountVmReservationKey,
  type AccountVm,
  WorkspaceIsolationAttestation,
} from '@/lib/intelligence/execution/accountCompute/contracts';
import {
  claimAccountVm,
  getAccountVm,
  attachWorkspaceToVm,
  detachWorkspaceFromVm,
  markVmReady,
  markVmFailed,
  resolveProvisioning,
  type WorkspaceAttach,
} from '@/lib/intelligence/execution/accountCompute/reservation';
import { canSuspend, type DesktopPhase, type TenantScope } from '@/lib/intelligence/execution/vdi/contracts';

export const ENABLE_ACCOUNT_COMPUTE_LIFECYCLE =
  process.env.ENABLE_ACCOUNT_COMPUTE_LIFECYCLE === 'true';

/** Minimal provider surface the lifecycle needs. Daytona adapter satisfies it. */
export interface AccountVmProvider {
  readonly id: string;
  readonly capabilities: AccountVmProviderCapabilities;
  create(spec: { memoryMb?: number; cpuShares?: number; storageGb?: number }, scope: TenantScope): Promise<{
    desktopId: string;
    providerId: string;
  }>;
  resume(desktopId: string, scope: TenantScope): Promise<void>;
  suspend(desktopId: string, scope: TenantScope): Promise<void>;
  get(desktopId: string, scope: TenantScope): Promise<{ phase: DesktopPhase } | null>;
}

export interface ProvisionAccountVmResult {
  claimed: boolean;
  replay: boolean;
  vmId: string;
  state: string;
  generation: number;
  desktopId: string | null;
}

export interface AttachWorkspaceResult {
  attached: boolean;
  replay: boolean;
  workspaceId: string;
  computeNamespace: string;
  generation: number;
}

function requireLifecycleEnabled() {
  if (!ENABLE_ACCOUNT_COMPUTE_LIFECYCLE) {
    throw new Error('Account compute lifecycle is disabled (ENABLE_ACCOUNT_COMPUTE_LIFECYCLE)');
  }
}

/**
 * Provision one VM per account, generation-fenced.
 *
 * Flow:
 *   1. claimAccountVm (A1) — durable reservation, idempotent on owner
 *   2. Daytona create — only when claim was fresh (not replay)
 *   3. markVmReady with generation — CAS; aborts if another writer moved state
 *   4. On provider failure: markVmFailed, retain for reconciliation
 *
 * Never creates a second VM for the same account; existing provisioning is
 * waited on, never duplicated.
 */
export async function provisionAccountVm(
  ownerUserId: string,
  provider: AccountVmProvider,
  entitlement: { vcpus: number; memoryMb: number; storageGb: number }
): Promise<ProvisionAccountVmResult> {
  requireLifecycleEnabled();

  const operationKey = accountVmReservationKey(ownerUserId);
  const claim = await claimAccountVm(
    ownerUserId,
    operationKey,
    provider.capabilities.runtimeTypes.includes('linux_vm') ? 'daytona-vm-small' : 'daytona-vm',
    { vcpus: entitlement.vcpus, memoryMb: entitlement.memoryMb, storageGb: entitlement.storageGb, maxConcurrentWorkspaces: 10 }
  );

  // Replay: VM already exists; return current state without provisioning.
  if (claim.replay) {
    const current = await getAccountVm(ownerUserId);
    return {
      claimed: true,
      replay: true,
      vmId: claim.vmId,
      state: claim.state,
      generation: claim.generation,
      desktopId: current?.desktop_id ?? null,
    };
  }

  // Fresh claim: provision via provider. Generation CAS on mark_ready.
  const scope: TenantScope = { tenantId: `user:${ownerUserId}`, workspaceId: '__lattice_account_vm__' };
  let desktopId: string | null = null;
  let providerId: string | null = null;

  try {
    const created = await provider.create(
      { memoryMb: entitlement.memoryMb, cpuShares: entitlement.vcpus, storageGb: entitlement.storageGb },
      scope
    );
    desktopId = created.desktopId;
    providerId = created.providerId;

    const ready = await markVmReady(ownerUserId, desktopId, providerId, claim.generation);
    if (!ready.ok) {
      // Another writer advanced state; record uncertainty for reconciliation.
      await resolveProvisioning(ownerUserId, 'uncertain', new Date().toISOString());
      return {
        claimed: true,
        replay: false,
        vmId: claim.vmId,
        state: ready.reason ?? 'unknown',
        generation: ready.generation ?? claim.generation + 1,
        desktopId: null,
      };
    }

    return {
      claimed: true,
      replay: false,
      vmId: claim.vmId,
      state: 'ready',
      generation: ready.generation ?? claim.generation + 1,
      desktopId,
    };
  } catch (error) {
    await markVmFailed(ownerUserId, claim.generation);
    await resolveProvisioning(ownerUserId, 'failed', new Date().toISOString());
    throw error;
  }
}

/**
 * Resume a suspended account VM. Requires provider durableSuspend.
 */
export async function resumeAccountVm(
  ownerUserId: string,
  provider: AccountVmProvider
): Promise<{ ok: boolean; state: string; generation?: number; reason?: string }> {
  requireLifecycleEnabled();

  const current = await getAccountVm(ownerUserId);
  if (!current) {
    return { ok: false, state: 'not_found', reason: 'vm not found' };
  }
  if (current.state !== 'suspended') {
    return { ok: false, state: current.state, reason: 'vm not suspended' };
  }

  const scope: TenantScope = { tenantId: `user:${ownerUserId}`, workspaceId: '__lattice_account_vm__' };
  if (!provider.capabilities.durableSuspend) {
    return { ok: false, state: current.state, reason: 'resume_not_supported' };
  }

  const desktopId = current.desktop_id;
  if (!desktopId) {
    return { ok: false, state: current.state, reason: 'no desktop id' };
  }

  await provider.resume(desktopId, scope);

  const ready = await markVmReady(ownerUserId, desktopId, current.provider_id ?? '', current.generation);
  if (!ready.ok) {
    return { ok: false, state: ready.reason ?? 'generation_mismatch', generation: ready.generation, reason: ready.reason };
  }

  return { ok: true, state: 'ready', generation: ready.generation };
}

/**
 * Suspend an account VM. Refused when an active session or execution lease exists.
 */
export async function suspendAccountVm(
  ownerUserId: string,
  provider: AccountVmProvider
): Promise<{ ok: boolean; state: string; generation?: number; reason?: string }> {
  requireLifecycleEnabled();

  const current = await getAccountVm(ownerUserId);
  if (!current) {
    return { ok: false, state: 'not_found', reason: 'vm not found' };
  }
  if (current.state !== 'ready') {
    return { ok: false, state: current.state, reason: 'vm not ready' };
  }

  const desktopId = current.desktop_id;
  if (!desktopId) {
    return { ok: false, state: current.state, reason: 'no desktop id' };
  }

  const scope: TenantScope = { tenantId: `user:${ownerUserId}`, workspaceId: '__lattice_account_vm__' };
  const desktop = await provider.get(desktopId, scope);
  if (!desktop || !canSuspend({ desktopId, spec: {} as any, providerId: '', provider: '', phase: desktop.phase, createdAt: new Date().toISOString(), tenantId: scope.tenantId, workspaceId: scope.workspaceId } as any)) {
    return { ok: false, state: current.state, reason: 'active lease blocks suspend' };
  }

  await provider.suspend(desktopId, scope);

  const ready = await markVmReady(ownerUserId, desktopId, current.provider_id ?? '', current.generation);
  if (!ready.ok) {
    return { ok: false, state: ready.reason ?? 'generation_mismatch', generation: ready.generation, reason: ready.reason };
  }

  return { ok: true, state: 'suspended', generation: ready.generation };
}

/**
 * Attach a workspace to the account VM. Generation CAS; idempotent on replay.
 */
export async function attachWorkspace(
  ownerUserId: string,
  workspaceId: string,
  computeNamespace: string,
  expectedGeneration?: number
): Promise<AttachWorkspaceResult> {
  requireLifecycleEnabled();
  return attachWorkspaceToVm(ownerUserId, workspaceId, computeNamespace, expectedGeneration);
}

/**
 * Detach a workspace from the account VM. Generation CAS.
 */
export async function detachWorkspace(
  ownerUserId: string,
  workspaceId: string,
  expectedGeneration: number
): Promise<{ ok: boolean; generation?: number; reason?: string }> {
  requireLifecycleEnabled();
  return detachWorkspaceFromVm(ownerUserId, workspaceId, expectedGeneration);
}

/**
 * Verify the provider advertises genuine linux_vm capability with all four
 * isolation attestations. Returns false if the org only provisions containers
 * (must not silently fall back).
 */
export function verifyProviderCapability(
  provider: AccountVmProvider,
  isolation: WorkspaceIsolationAttestation
): { qualified: boolean; reason?: string } {
  if (!provider.capabilities.runtimeTypes.includes('linux_vm')) {
    return { qualified: false, reason: 'vm_unavailable: provider advertises container only' };
  }
  if (
    isolation.filesystem !== true ||
    isolation.process !== true ||
    isolation.network !== true ||
    isolation.secrets !== true
  ) {
    return { qualified: false, reason: 'isolation_unverified' };
  }
  return { qualified: true };
}
