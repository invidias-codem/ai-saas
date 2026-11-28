// Account Compute Plane — Slice A0 (pure policy; no provider calls).
//
// A Clerk user gets at most one account-scoped VM. Multiple accessible
// workspaces attach to *isolated* guest environments inside that VM.
// IMPORTANT: this module is not provisioning authority. A database UNIQUE
// account claim and idempotent VDI reservation are required before activation.

import { createHash } from 'node:crypto';
import type { DesktopPhase, DesktopRuntimeType, TenantScope } from '@/lib/intelligence/execution/vdi/contracts';
import type { WorkspaceRole } from '@/lib/security/workspaceAccess';

/** Reserved broker scope: never use a user-created workspace ID for a VM. */
export const ACCOUNT_VM_VDI_WORKSPACE_ID = '__lattice_account_vm__';

export interface AccountVm {
  readonly ownerUserId: string;
  readonly desktopId: string;
  readonly phase: DesktopPhase;
  readonly runtimeType: DesktopRuntimeType;
}

/** Each assertion requires a separately qualified guest-container boundary. */
export interface WorkspaceIsolationAttestation {
  readonly filesystem: boolean;
  readonly process: boolean;
  readonly network: boolean;
  readonly secrets: boolean;
}

export interface AccountVmProviderCapabilities {
  readonly runtimeTypes: readonly DesktopRuntimeType[];
  readonly durableSuspend: boolean;
  readonly isolation: WorkspaceIsolationAttestation;
  /** Provider-verified per-VM ceilings, not requested values. */
  readonly maxVcpus: number;
  readonly maxMemoryMb: number;
  readonly maxStorageGb: number;
}

export interface AccountComputeEntitlement {
  readonly vcpus: number;
  readonly memoryMb: number;
  readonly storageGb: number;
  /** Admission broker enforces the actual concurrent lease count. */
  readonly maxConcurrentWorkspaces: number;
}

export interface AccountComputeRequest {
  /** Must be derived from a server-verified Clerk session, never request JSON. */
  readonly requesterUserId: string;
  readonly ownerUserId: string;
  readonly workspaceId: string;
  /** Derived from getWorkspaceAccess (accepted memberships only). */
  readonly workspaceRole: WorkspaceRole | null;
  readonly featureEnabled: boolean;
  readonly provider: AccountVmProviderCapabilities;
  readonly entitlement: AccountComputeEntitlement;
  /** Resolved by durable account-unique reservation, NOT workspace lookup. */
  readonly existingVm: AccountVm | null;
}

export type AccountComputeAction = 'blocked' | 'provision' | 'reuse' | 'resume' | 'wait';
export type AccountComputeReason =
  | 'feature_disabled'
  | 'access_denied'
  | 'vm_unavailable'
  | 'isolation_unverified'
  | 'quota_unavailable'
  | 'owner_mismatch'
  | 'legacy_runtime_rejected'
  | 'vm_needs_reconciliation'
  | 'resume_not_supported'
  | 'provision_required'
  | 'ready'
  | 'suspended'
  | 'provisioning';

export interface AccountComputePlan {
  readonly action: AccountComputeAction;
  readonly reason: AccountComputeReason;
  readonly accountKey?: string;
  readonly vdiScope?: TenantScope;
  readonly workspaceNamespace?: string;
  readonly desktopId?: string;
}

function blocked(reason: AccountComputeReason): AccountComputePlan {
  return { action: 'blocked', reason };
}

/** Stable across workspace creation, image upgrades, and VM resizes. */
export function accountVmReservationKey(userId: string): string {
  if (!userId.trim()) throw new Error('Account user ID required');
  return 'account-vm:v1:' + createHash('sha256').update(userId).digest('hex');
}

/**
 * Existing VDI broker scopes are (tenant, workspace). The VM is account-wide:
 * a fixed reserved workspace scope ensures all of the account's projects
 * address the SAME broker resource instead of provisioning per project.
 */
export function accountVmVdiScope(userId: string): TenantScope {
  if (!userId.trim()) throw new Error('Account user ID required');
  return { tenantId: 'user:' + userId, workspaceId: ACCOUNT_VM_VDI_WORKSPACE_ID };
}

/** Opaque namespace only; actual isolation MUST be enforced by the guest. */
export function workspaceComputeNamespace(userId: string, workspaceId: string): string {
  if (!userId.trim() || !workspaceId.trim() || workspaceId === ACCOUNT_VM_VDI_WORKSPACE_ID) {
    throw new Error('Valid account and workspace IDs required');
  }
  const hash = createHash('sha256').update(userId).update('\0').update(workspaceId).digest('hex');
  return 'ws-' + hash.slice(0, 32);
}

function validQuota(q: AccountComputeEntitlement, p: AccountVmProviderCapabilities): boolean {
  return [q.vcpus, q.memoryMb, q.storageGb, q.maxConcurrentWorkspaces].every(
    (n) => Number.isSafeInteger(n) && n > 0,
  ) && q.vcpus <= p.maxVcpus && q.memoryMb <= p.maxMemoryMb && q.storageGb <= p.maxStorageGb;
}

/**
 * Fail-closed admission planning. This NEVER creates a VM or authorizes a
 * command. The service must recheck membership, hold a durable account-level
 * allocation claim, and obtain a workspace-specific execution lease.
 */
export function planAccountCompute(req: AccountComputeRequest): AccountComputePlan {
  if (!req.featureEnabled) return blocked('feature_disabled');
  if (
    !req.requesterUserId.trim() ||
    req.ownerUserId !== req.requesterUserId ||
    !req.workspaceId.trim() ||
    req.workspaceId === ACCOUNT_VM_VDI_WORKSPACE_ID ||
    !['owner', 'admin', 'member'].includes(req.workspaceRole ?? '')
  ) return blocked('access_denied');

  // Never fall back from a requested VM to Daytona's container capability.
  if (!req.provider.runtimeTypes.includes('linux_vm')) return blocked('vm_unavailable');
  const isolation = req.provider.isolation;
  if (
    isolation?.filesystem !== true ||
    isolation?.process !== true ||
    isolation?.network !== true ||
    isolation?.secrets !== true
  ) return blocked('isolation_unverified');
  if (!validQuota(req.entitlement, req.provider)) return blocked('quota_unavailable');

  const accountKey = accountVmReservationKey(req.ownerUserId);
  const vdiScope = accountVmVdiScope(req.ownerUserId);
  const workspaceNamespace = workspaceComputeNamespace(req.ownerUserId, req.workspaceId);
  const base = { accountKey, vdiScope, workspaceNamespace };

  const vm = req.existingVm;
  if (!vm) return { action: 'provision', reason: 'provision_required', ...base };
  if (vm.ownerUserId !== req.ownerUserId) return blocked('owner_mismatch');
  if (vm.runtimeType !== 'linux_vm') return blocked('legacy_runtime_rejected');

  switch (vm.phase) {
    case 'ready':
      return { action: 'reuse', reason: 'ready', desktopId: vm.desktopId, ...base };
    case 'suspended':
      if (!req.provider.durableSuspend) return blocked('resume_not_supported');
      return { action: 'resume', reason: 'suspended', desktopId: vm.desktopId, ...base };
    case 'provisioning':
      return { action: 'wait', reason: 'provisioning', desktopId: vm.desktopId, ...base };
    default:
      // Failed/degraded/deleted machines require explicit reconciliation.
      // NEVER silently create a second VM for the same account.
      return blocked('vm_needs_reconciliation');
  }
}
