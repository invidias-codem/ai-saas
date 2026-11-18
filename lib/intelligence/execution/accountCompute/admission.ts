// Account Compute Plane — Slice A3.2: workspace admission.
//
// Server-verified membership for guest compute. Every operation is bound to
// an account and a workspace. Reuses getWorkspaceAccess() for membership
// verification (ownership or an ACCEPTED membership — revoked memberships
// deny on the next call, no cached state).

import { getWorkspaceAccess, type WorkspaceAccess } from '@/lib/security/workspaceAccess';
import { workspaceComputeNamespace } from '@/lib/intelligence/execution/accountCompute/contracts';

export interface AdmissionDecision {
  allowed: boolean;
  reason?: string;
  access?: WorkspaceAccess;
  workspaceNamespace?: string;
}

/**
 * Verify the caller may run a guest in this workspace. Server-verified:
 * reads workspace_members + workspaces tables directly, never trusts request
 * JSON for identity. Returns null (denied) on revoked membership.
 */
export async function admitWorkspace(
  userId: string,
  workspaceId: string,
): Promise<AdmissionDecision> {
  if (!userId || !userId.trim()) {
    return { allowed: false, reason: 'user required' };
  }
  if (!workspaceId || !workspaceId.trim()) {
    return { allowed: false, reason: 'workspace required' };
  }

  const access = await getWorkspaceAccess(userId, workspaceId);
  if (!access) {
    return { allowed: false, reason: 'access denied' };
  }

  // owner/admin/member may run guests; viewer is read-only.
  if (!['owner', 'admin', 'member'].includes(access.role)) {
    return { allowed: false, reason: 'insufficient role' };
  }

  return {
    allowed: true,
    access,
    workspaceNamespace: workspaceComputeNamespace(userId, workspaceId),
  };
}
