/**
 * Phase 1 (#443 review) — fixture-backed discovery→search flow through the
 * ACTUAL registry: no selected workspace → workspace_list → explicit-target
 * search. Real tools, real ToolRegistry + executeTool path; only the data
 * edges (supabase, source service) are mocked. No live customer data.
 */
jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn(),
  listAccessibleWorkspaces: jest.fn(),
  canWorkspaceRole: jest.fn(() => true),
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
jest.mock('@/lib/ucol/contextFirewall', () => ({ interceptTool: () => ({ decision: 'allow' }) }));
jest.mock('@/lib/execution/sandboxManager', () => ({ sandboxManager: {} }));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn(), auditEnterprise: jest.fn() }));
// Irrelevant real tool modules are stubbed: loading them pulls untransformed
// ESM chains (generateMusic → media/music → analytics/track). The tools under
// test — workspaceTools and intelligenceTools — stay REAL.
jest.mock('@/lib/agents/tools/dealSentinel', () => ({ dealSentinelTool: { name: 'analyze_and_negotiate_quote' } }));
jest.mock('@/lib/agents/tools/webSearch', () => ({ webSearchTool: { name: 'web_search' } }));
jest.mock('@/lib/agents/tools/researchWriter', () => ({ researchWriterTool: { name: 'write_research_paper' } }));
jest.mock('@/lib/agents/tools/novelWriter', () => ({ novelWriterTool: { name: 'write_creative_content' } }));
jest.mock('@/lib/agents/tools/searchCodebase', () => ({ searchCodebaseTool: { name: 'search_codebase' } }));
jest.mock('@/lib/agents/tools/generateMusic', () => ({ generateMusicTool: { name: 'generate_music' } }));
jest.mock('@/lib/agents/tools/generateImage', () => ({ generateImageTool: { name: 'generate_image' } }));
jest.mock('@/lib/agents/tools/generateVideo', () => ({ generateVideoTool: { name: 'generate_video' } }));
jest.mock('@/lib/agents/tools/harnessTools', () => ({
  readFileTool: { name: 'read_file' },
  writeFileTool: { name: 'write_file' },
  patchFileTool: { name: 'patch_file' },
}));
jest.mock('@/lib/agents/tools/executionTools', () => ({ executeCommandTool: { name: 'execute_command' } }));

import { buildAuthorizedToolSet, registryFromTools } from '@/lib/agents/core/agenticToolSet';
import { buildCapabilityManifest } from '@/lib/agents/core/capabilityManifest';
import { getWorkspaceAccess, listAccessibleWorkspaces } from '@/lib/security/workspaceAccess';
import { queryWorkspaceSources } from '@/lib/workspace/sources';

// Valid v4 UUIDs — no live customer data, fixture only.
const ALPHA_ID = '5b1f2a3c-9d4e-4f60-8a1b-2c3d4e5f6a7b';

// Workspace-less agentic run: the exact runtime shape of the P1 reproduction.
const WORKSPACE_LESS_MANIFEST = buildCapabilityManifest({
  resolvedMode: 'agentic',
  workspaceId: null,
  surface: 'web',
  memoryReadEnabled: false,
  webResearchEnabled: false,
  ioHarnessPresent: false,
});

const ctx = { userId: 'u1', sessionId: 's1', workspaceId: undefined, userRole: 'user' } as any;

beforeEach(() => {
  (getWorkspaceAccess as jest.Mock).mockReset();
  (listAccessibleWorkspaces as jest.Mock).mockReset();
  (queryWorkspaceSources as jest.Mock).mockReset();
});

describe('workspace-less discovery → explicit-target search (#443 review)', () => {
  it('the workspace-less agentic catalog exposes list AND search — the flow can complete', () => {
    const registry = registryFromTools(buildAuthorizedToolSet(WORKSPACE_LESS_MANIFEST));
    const names = registry.getToolNames();
    expect(names).toContain('workspace_list');
    expect(names).toContain('query_workspace_sources');
  });

  it('"Show my workspaces" → "find it in Client Alpha" → explicit-target search cites its sources', async () => {
    (listAccessibleWorkspaces as jest.Mock).mockResolvedValue([
      { id: ALPHA_ID, name: 'Client Alpha', kind: 'project', is_default: false, role: 'viewer', via: 'member' },
    ]);
    (getWorkspaceAccess as jest.Mock).mockResolvedValue({
      workspaceId: ALPHA_ID,
      userId: 'u1',
      role: 'viewer',
      permissions: [],
      source: 'workspace_members',
    });
    (queryWorkspaceSources as jest.Mock).mockResolvedValue([
      {
        id: 'src-1',
        content: 'Onboarding requires completing the security checklist.',
        title: 'Onboarding requirements',
        lineage: [],
      },
    ]);

    const registry = registryFromTools(buildAuthorizedToolSet(WORKSPACE_LESS_MANIFEST));

    // executeTool wraps: { success, data: <the tool's own ToolResult> }.
    // Step 1: "Show my workspaces." — discovery with no selected workspace.
    const listed = await registry.executeTool('workspace_list', {}, ctx);
    expect(listed.success).toBe(true);
    expect(listed.data.success).toBe(true);
    expect(listed.data.data.workspaces).toHaveLength(1);
    expect(listed.data.data.workspaces[0]).toMatchObject({
      id: ALPHA_ID,
      name: 'Client Alpha',
      role: 'viewer',
    });

    // Step 2: "Find the onboarding requirements in Client Alpha." — explicit
    // target resolved from the listing, authorized at execute time.
    const search = await registry.executeTool(
      'query_workspace_sources',
      { query: 'onboarding requirements', targetWorkspaceId: ALPHA_ID },
      ctx,
    );
    expect(search.success).toBe(true);
    expect(search.data.success).toBe(true);
    expect(getWorkspaceAccess).toHaveBeenCalledWith('u1', ALPHA_ID);
    expect(queryWorkspaceSources).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: ALPHA_ID, userId: 'u1' }),
    );
    expect(String(search.data.data)).toContain('Onboarding requires completing the security checklist.');
  });

  it('with neither a selected workspace nor a target, the search fails explicitly', async () => {
    const registry = registryFromTools(buildAuthorizedToolSet(WORKSPACE_LESS_MANIFEST));
    const result = await registry.executeTool('query_workspace_sources', { query: 'anything' }, ctx);
    // The registry executed the tool; the TOOL failed explicitly — neither a
    // selected workspace nor an explicit target exists.
    expect(result.data.success).toBe(false);
    expect(String(result.data.error)).toContain('Missing workspace context.');
    expect(getWorkspaceAccess).not.toHaveBeenCalled();
    expect(queryWorkspaceSources).not.toHaveBeenCalled();
  });
});
