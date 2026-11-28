/**
 * Phase 1 (#442) — workspace discovery tools.
 *
 * Tool contracts with the shared seam mocked: the tools must call the seam
 * with the effective workspace (explicit target, or the conversation's own),
 * deny uniformly, and never write. Catalog parity for the new capability is
 * covered in authorized-catalog-parity.
 */
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
  listAccessibleWorkspaces: jest.fn(),
  canWorkspaceRole: jest.fn((role: string, permission: string) =>
    role === 'owner' ? true : ['workspace:read', 'memory:read', 'document:read'].includes(permission),
  ),
  WORKSPACE_ACCESS_DENIED_MESSAGE: 'Workspace not found or not accessible.',
  WORKSPACE_ROLES: ['owner', 'admin', 'member', 'viewer'],
  WORKSPACE_PERMISSIONS: [],
  WORKSPACE_ROLE_PERMISSIONS: { owner: [], admin: [], member: [], viewer: [] },
  normalizeWorkspaceRole: jest.fn((r: string) => r),
  requireWorkspacePermission: jest.fn(),
}));
jest.mock('@/lib/workspace/sources', () => ({ queryWorkspaceSources: jest.fn() }));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

import { workspaceListTool, workspaceDescribeTool } from '@/lib/agents/tools/workspaceTools';
import { workspaceSourcesSearchTool } from '@/lib/agents/tools/intelligenceTools';
import { getWorkspaceAccess, listAccessibleWorkspaces } from '@/lib/security/workspaceAccess';
import { queryWorkspaceSources } from '@/lib/workspace/sources';

const DENIED = 'Workspace not found or not accessible.';
const ctx = { userId: 'u1', sessionId: 's1', workspaceId: 'ws-default' } as any;

beforeEach(() => {
  (getWorkspaceAccess as jest.Mock).mockReset();
  (listAccessibleWorkspaces as jest.Mock).mockReset();
  (queryWorkspaceSources as jest.Mock).mockReset();
  require('@/lib/supabaseClient').supabaseAdmin.from.mockReset();
});

describe('workspace_list (#442)', () => {
  it('lists accessible workspaces with limited metadata', async () => {
    (listAccessibleWorkspaces as jest.Mock).mockResolvedValue([
      { id: 'w1', name: 'Owned Default', kind: 'personal', is_default: true, role: 'owner', via: 'owner' },
      { id: 'w2', name: 'Client Alpha', kind: 'project', is_default: false, role: 'viewer', via: 'member' },
    ]);
    const result = await workspaceListTool.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(listAccessibleWorkspaces).toHaveBeenCalledWith('u1');
    expect(result.data.workspaces).toHaveLength(2);
    expect(result.data.workspaces[1]).toMatchObject({ id: 'w2', name: 'Client Alpha', role: 'viewer', via: 'member' });
  });

  it('requires user context', async () => {
    const result = await workspaceListTool.execute({}, { userId: undefined } as any);
    expect(result.success).toBe(false);
  });
});

describe('workspace_describe (#442)', () => {
  it('describes an authorized workspace with role-derived read capabilities', async () => {
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({
      workspaceId: 'w2', userId: 'u1', role: 'viewer', permissions: [], source: 'workspace_members',
    });
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn().mockResolvedValue({ data: { name: 'Client Alpha', description: 'Client workspace', kind: 'project', is_default: false }, error: null }),
      insert: jest.fn(),
      upsert: jest.fn(),
    };
    require('@/lib/supabaseClient').supabaseAdmin.from.mockReturnValue(builder);

    const result = await workspaceDescribeTool.execute({ workspaceId: 'w2' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data.workspace).toMatchObject({ id: 'w2', name: 'Client Alpha', kind: 'project' });
    expect(result.data.role).toBe('viewer');
    expect(result.data.accessSource).toBe('workspace_members');
    expect(result.data.capabilities).toMatchObject({ source_search: true, memory_read: true, document_read: true });
  });

  it('denies uniformly — the denied caller learns nothing, and nothing is probed', async () => {
    (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);
    const result = await workspaceDescribeTool.execute({ workspaceId: 'ws-other' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe(DENIED);
    expect(require('@/lib/supabaseClient').supabaseAdmin.from).not.toHaveBeenCalled();
  });
});

describe('query_workspace_sources — explicit targeting (#442)', () => {
  it('defaults to the conversation workspace when no target is passed', async () => {
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({ workspaceId: 'ws-default', userId: 'u1', role: 'owner', permissions: [], source: 'workspace_owner' });
    (queryWorkspaceSources as jest.Mock).mockResolvedValue([]);

    const result = await workspaceSourcesSearchTool.execute({ query: 'onboarding requirements' }, ctx);
    expect(result.success).toBe(true);
    expect(getWorkspaceAccess).toHaveBeenCalledWith('u1', 'ws-default');
    expect(queryWorkspaceSources).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-default', userId: 'u1', query: 'onboarding requirements' }),
    );
  });

  it('searches the EXPLICIT target — the conversation workspace is never touched', async () => {
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({ workspaceId: 'ws-alpha', userId: 'u1', role: 'viewer', permissions: [], source: 'workspace_members' });
    (queryWorkspaceSources as jest.Mock).mockResolvedValue([
      { id: 's1', content: 'Onboarding requires completing the security checklist.', title: 'Onboarding', lineage: [] },
    ]);

    const result = await workspaceSourcesSearchTool.execute(
      { query: 'onboarding requirements', targetWorkspaceId: 'ws-alpha' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(getWorkspaceAccess).toHaveBeenCalledWith('u1', 'ws-alpha');
    expect(queryWorkspaceSources).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-alpha' }),
    );
    const passedWorkspaceId = (queryWorkspaceSources as jest.Mock).mock.calls[0][0].workspaceId;
    expect(passedWorkspaceId).not.toBe('ws-default');
    expect(String(result.data)).toContain('Onboarding requires completing the security checklist.');
  });

  it('an unauthorized target denies uniformly without searching', async () => {
    (getWorkspaceAccess as jest.Mock).mockResolvedValue(null);
    const result = await workspaceSourcesSearchTool.execute(
      { query: 'secrets', targetWorkspaceId: 'ws-other' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe(DENIED);
    expect(queryWorkspaceSources).not.toHaveBeenCalled();
  });

  it('missing workspace context is an explicit failure, not a silent default', async () => {
    const result = await workspaceSourcesSearchTool.execute(
      { query: 'q' },
      { userId: 'u1', workspaceId: undefined } as any,
    );
    expect(result.success).toBe(false);
    expect(getWorkspaceAccess).not.toHaveBeenCalled();
  });
});
