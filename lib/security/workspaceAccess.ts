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

/** Uniform, non-disclosing denial message for inaccessible workspaces (#442). */
export const WORKSPACE_ACCESS_DENIED_MESSAGE = 'Workspace not found or not accessible.';

export function normalizeWorkspaceRole(role: unknown): WorkspaceRole | null {
  return typeof role === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(role)
    ? (role as WorkspaceRole)
    : null;
}

export function canWorkspaceRole(role: WorkspaceRole | null | undefined, permission: WorkspacePermission): boolean {
  if (!role) return false;
  return WORKSPACE_ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Trace one authorization outcome (#442: traces identify the target workspace
 * and the authorization outcome). Fire-and-forget.
 */
async function logAccessOutcome(args: {
  userId: string;
  workspaceId: string;
  outcome: 'granted' | 'denied';
  via?: 'workspace_members' | 'workspace_owner';
  role?: WorkspaceRole;
}): Promise<void> {
  try {
    const { logEvent } = await import('@/lib/telemetry');
    logEvent({
      eventType: 'workspace_access_checked',
      userId: args.userId,
      workspaceId: args.workspaceId,
      metadata: { outcome: args.outcome, via: args.via ?? null, role: args.role ?? null },
    });
  } catch {
    // telemetry is best-effort by contract
  }
}

/**
 * The single reusable access check (#442): ownership OR an ACCEPTED
 * membership. A pending invitation (accepted_at is null) grants nothing —
 * the membership row is ignored and access falls through to the ownership
 * check. Revocation is row deletion, so a removed membership denies on the
 * next call (no cached state).
 */
export async function getWorkspaceAccess(userId: string, workspaceId: string): Promise<WorkspaceAccess | null> {
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('role, accepted_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError && membershipError.code !== '42P01') {
    throw membershipError;
  }

  const memberRole = normalizeWorkspaceRole(membership?.role);
  const membershipAccepted = Boolean(membership?.accepted_at);
  if (memberRole && membershipAccepted) {
    void logAccessOutcome({
      userId,
      workspaceId,
      outcome: 'granted',
      via: 'workspace_members',
      role: memberRole,
    });
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
  if (!ownerWorkspace) {
    void logAccessOutcome({ userId, workspaceId, outcome: 'denied' });
    return null;
  }

  void logAccessOutcome({
    userId,
    workspaceId,
    outcome: 'granted',
    via: 'workspace_owner',
    role: 'owner',
  });
  return {
    workspaceId,
    userId,
    role: 'owner',
    permissions: WORKSPACE_ROLE_PERMISSIONS.owner,
    source: 'workspace_owner',
  };
}

export interface AccessibleWorkspace {
  id: string;
  name: string;
  kind: string | null;
  is_default: boolean | null;
  role: WorkspaceRole;
  via: 'owner' | 'member';
}

/**
 * Read-only discovery (#442): every workspace the user may access — owned
 * plus ACCEPTED shared memberships, deduplicated (owned wins). No
 * default-workspace creation, no writes.
 */
export async function listAccessibleWorkspaces(userId: string): Promise<AccessibleWorkspace[]> {
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from('workspaces')
    .select('id, name, kind, is_default')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });

  if (ownedError) throw ownedError;

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id, role, accepted_at')
    .eq('user_id', userId);

  if (membershipError && membershipError.code !== '42P01') {
    throw membershipError;
  }

  const ownedIds = new Set((owned ?? []).map((w: { id: string }) => w.id));
  const acceptedShared = (memberships ?? [])
    .filter((m) => Boolean(m.accepted_at) && !ownedIds.has(m.workspace_id))
    .map((m) => ({ workspaceId: m.workspace_id as string, role: normalizeWorkspaceRole(m.role) }))
    .filter((m): m is { workspaceId: string; role: WorkspaceRole } => m.role !== null);

  const sharedById = new Map(acceptedShared.map((m) => [m.workspaceId, m.role]));
  let sharedMeta: Array<{ id: string; name: string; kind: string | null; is_default: boolean | null }> = [];
  if (sharedById.size > 0) {
    const { data: sharedRows, error: sharedError } = await supabaseAdmin
      .from('workspaces')
      .select('id, name, kind, is_default')
      .in('id', Array.from(sharedById.keys()));

    if (sharedError) throw sharedError;
    sharedMeta = sharedRows ?? [];
  }

  const results: AccessibleWorkspace[] = [
    ...(owned ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      kind: w.kind ?? null,
      is_default: w.is_default ?? null,
      role: 'owner' as WorkspaceRole,
      via: 'owner' as const,
    })),
    ...sharedMeta.map((w) => ({
      id: w.id,
      name: w.name,
      kind: w.kind ?? null,
      is_default: w.is_default ?? null,
      role: sharedById.get(w.id) ?? ('viewer' as WorkspaceRole),
      via: 'member' as const,
    })),
  ];

  return results.sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) || a.name.localeCompare(b.name));
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
