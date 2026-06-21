import { supabaseAdmin } from '@/lib/supabaseClient';

export const WORKSPACE_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_PERMISSIONS = [
  'workspace:read',
  'workspace:update',
  'workspace:delete',
  'member:invite',
  'member:update',
  'member:remove',
  'repository:link',
  'repository:unlink',
  'memory:read',
  'memory:write',
  'document:read',
  'document:write',
  'partner_key:read',
  'partner_key:create',
  'partner_key:revoke',
  'audit:read',
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  owner: WORKSPACE_PERMISSIONS,
  admin: [
    'workspace:read',
    'workspace:update',
    'member:invite',
    'member:update',
    'member:remove',
    'repository:link',
    'repository:unlink',
    'memory:read',
    'memory:write',
    'document:read',
    'document:write',
    'partner_key:read',
    'partner_key:create',
    'partner_key:revoke',
    'audit:read',
  ],
  member: [
    'workspace:read',
    'repository:link',
    'repository:unlink',
    'memory:read',
    'memory:write',
    'document:read',
    'document:write',
  ],
  viewer: ['workspace:read', 'memory:read', 'document:read'],
};

export interface WorkspaceAccess {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  permissions: readonly WorkspacePermission[];
  source: 'workspace_members' | 'workspace_owner';
}

export function normalizeWorkspaceRole(role: unknown): WorkspaceRole | null {
  return typeof role === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(role)
    ? (role as WorkspaceRole)
    : null;
}

export function canWorkspaceRole(role: WorkspaceRole | null | undefined, permission: WorkspacePermission): boolean {
  if (!role) return false;
  return WORKSPACE_ROLE_PERMISSIONS[role].includes(permission);
}

export async function getWorkspaceAccess(userId: string, workspaceId: string): Promise<WorkspaceAccess | null> {
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError && membershipError.code !== '42P01') {
    throw membershipError;
  }

  const memberRole = normalizeWorkspaceRole(membership?.role);
  if (memberRole) {
    return {
      workspaceId,
      userId,
      role: memberRole,
      permissions: WORKSPACE_ROLE_PERMISSIONS[memberRole],
      source: 'workspace_members',
    };
  }

  // Compatibility fallback while older deployments apply the membership migration.
  const { data: ownerWorkspace, error: ownerError } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (ownerError) throw ownerError;
  if (!ownerWorkspace) return null;

  return {
    workspaceId,
    userId,
    role: 'owner',
    permissions: WORKSPACE_ROLE_PERMISSIONS.owner,
    source: 'workspace_owner',
  };
}

export async function requireWorkspacePermission(
  userId: string,
  workspaceId: string,
  permission: WorkspacePermission
): Promise<WorkspaceAccess> {
  const access = await getWorkspaceAccess(userId, workspaceId);
  if (!access || !canWorkspaceRole(access.role, permission)) {
    const error = new Error('Forbidden: insufficient workspace permissions');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return access;
}
