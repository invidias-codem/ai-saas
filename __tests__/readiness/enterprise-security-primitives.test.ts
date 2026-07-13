import fs from 'fs';
import path from 'path';
import {
  canWorkspaceRole,
  normalizeWorkspaceRole,
  WORKSPACE_ROLE_PERMISSIONS,
} from '@/lib/security/workspaceAccess';

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('Enterprise admin/security primitives', () => {
  it('adds a durable workspace membership/RBAC schema', () => {
    const migration = read('supabase/migrations/20260620000000_workspace_members_audit_primitives.sql');

    expect(migration).toContain('create table if not exists public.workspace_members');
    expect(migration).toContain("role text not null default 'member'");
    expect(migration).toContain("check (role in ('owner', 'admin', 'member', 'viewer'))");
    expect(migration).toContain('unique (workspace_id, user_id)');
    expect(migration).toContain('workspace_members_workspace_idx');
    expect(migration).toContain('workspace_members_user_idx');
    expect(migration).toContain('alter table public.workspace_members enable row level security');
    expect(migration).toContain('insert into public.workspace_members');
    expect(migration).toContain("'owner'");
  });

  it('defines least-privilege workspace role permissions', () => {
    expect(normalizeWorkspaceRole('owner')).toBe('owner');
    expect(normalizeWorkspaceRole('bad-role')).toBeNull();

    expect(canWorkspaceRole('owner', 'workspace:delete')).toBe(true);
    expect(canWorkspaceRole('admin', 'workspace:delete')).toBe(false);
    expect(canWorkspaceRole('admin', 'member:invite')).toBe(true);
    expect(canWorkspaceRole('member', 'partner_key:create')).toBe(false);
    expect(canWorkspaceRole('member', 'repository:link')).toBe(true);
    expect(canWorkspaceRole('viewer', 'memory:read')).toBe(true);
    expect(canWorkspaceRole('viewer', 'memory:write')).toBe(false);

    expect(WORKSPACE_ROLE_PERMISSIONS.owner).toContain('audit:read');
    expect(WORKSPACE_ROLE_PERMISSIONS.admin).not.toContain('workspace:delete');
  });

  it('extends audit logging for enterprise admin/security events', () => {
    const auditLog = read('lib/security/auditLog.ts');

    for (const action of [
      'workspace.create',
      'workspace.member.invite',
      'workspace.member.role_change',
      'workspace.member.remove',
      'workspace.repository.link',
      'workspace.repository.unlink',
      'partner_key.create',
      'partner_key.revoke',
      'provider_key.create',
      'provider_key.update',
      'provider_key.delete',
      'license.activation_attempt',
      'license.activation_success',
      'license.activation_failed',
      'preflight.check',
    ]) {
      expect(auditLog).toContain(`| '${action}'`);
    }
  });

  it('keeps license activation and preflight appliance checks env-validated and redacted', () => {
    // lib/env.ts re-exports the canonical schema from @lattice-os/core; the
    // authoritative env var definition lives in the core package schema.
    const env = read('packages/lattice-core/src/schemas/env.ts');
    const activateLicenseRoute = read('app/api/onboarding/activate-license/route.ts');
    const preflightRoute = read('app/api/preflight/route.ts');

    expect(env).toContain('LATTICE_INSTANCE_ID');
    expect(activateLicenseRoute).toContain('env.LATTICE_INSTANCE_ID');
    expect(activateLicenseRoute).not.toContain('process.env.LATTICE_INSTANCE_ID');

    expect(preflightRoute).toContain('license_configured');
    expect(preflightRoute).toContain('license_status');
    expect(preflightRoute).toContain('required_env');
    expect(preflightRoute).toContain('configured(');
    expect(preflightRoute).not.toContain('SUPABASE_SERVICE_ROLE_KEY!');
  });
});
