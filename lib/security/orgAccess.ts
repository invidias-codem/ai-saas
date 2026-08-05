/**
 * lib/security/orgAccess.ts
 *
 * Organization-level RBAC for P1 enterprise controls.
 *
 * Provides:
 *  - org role enumeration
 *  - org permission constants
 *  - org role → permission mapping
 *  - async org access resolution from organization_members
 *  - org-scoped permission checks
 */

import { supabaseAdmin } from '@/lib/supabaseClient';

export const ORG_ROLES = ['owner', 'admin', 'developer', 'auditor'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_PERMISSIONS = [
  'org:read',
  'org:update',
  'org:delete',
  'member:invite',
  'member:update',
  'member:remove',
  'sensitive_tools:use',
  'external_actions:use',
  'audit:read',
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
  owner: ORG_PERMISSIONS,
  admin: [
    'org:read',
    'member:invite',
    'member:update',
    'member:remove',
    'sensitive_tools:use',
    'audit:read',
  ],
  developer: [
    'org:read',
    'external_actions:use',
  ],
  auditor: [
    'org:read',
    'audit:read',
  ],
};

export interface OrgAccess {
  orgId: string;
  userId: string;
  role: OrgRole;
  permissions: readonly OrgPermission[];
}

export function normalizeOrgRole(role: unknown): OrgRole | null {
  return typeof role === 'string' && (ORG_ROLES as readonly string[]).includes(role)
    ? (role as OrgRole)
    : null;
}

export function canOrgRole(role: OrgRole | null | undefined, permission: OrgPermission): boolean {
  if (!role) return false;
  return ORG_ROLE_PERMISSIONS[role].includes(permission);
}

export async function getOrgAccess(orgId: string, userId: string): Promise<OrgAccess | null> {
  if (!supabaseAdmin) throw new Error('Database configuration missing');

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError && membershipError.code !== '42P01') {
    throw membershipError;
  }

  const role = normalizeOrgRole(membership?.role);
  if (!role) return null;

  return {
    orgId,
    userId,
    role,
    permissions: ORG_ROLE_PERMISSIONS[role],
  };
}

export async function requireOrgPermission(
  orgId: string,
  userId: string,
  permission: OrgPermission
): Promise<OrgAccess> {
  const access = await getOrgAccess(orgId, userId);
  if (!access || !canOrgRole(access.role, permission)) {
    const error = new Error('Forbidden: insufficient organization permissions');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return access;
}
