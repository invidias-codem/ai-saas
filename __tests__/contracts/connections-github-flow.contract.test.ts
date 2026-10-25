/**
 * Phase 2A (#444) — connections → read-only GitHub access, fixture-backed
 * through the ACTUAL registry. Real tools + real executeTool path; only the
 * data edges (supabase via the connection service, octokit) are mocked.
 * The real error classifier runs (partial module mock); no live calls.
 */
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('@/lib/encryption', () => ({ decrypt: jest.fn() }));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));
jest.mock('@/lib/ucol/contextFirewall', () => ({ interceptTool: () => ({ decision: 'allow' }) }));
jest.mock('@/lib/execution/sandboxManager', () => ({ sandboxManager: {} }));
jest.mock('@/lib/security/auditLog', () => ({ audit: jest.fn(), auditEnterprise: jest.fn() }));
// Partial mock: the REAL classifyGitHubError + ConnectionLookupError run;
// only the identity-bound data functions are mocked.
jest.mock('@/lib/integrations/connectionService', () => ({
  ...jest.requireActual('@/lib/integrations/connectionService'),
  getConnections: jest.fn(),
  resolveConnectionCredential: jest.fn(),
}));
jest.mock('@/lib/github', () => ({ getOctokit: jest.fn() }));
// Irrelevant real tool modules stubbed (ESM chains); the tools under test stay REAL.
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
jest.mock('@/lib/agents/tools/intelligenceTools', () => ({
  discoverDocumentsTool: { name: 'discover_documents_secure' },
  extractTextTool: { name: 'extract_text_secure' },
  summarizeRepoTool: { name: 'summarize_repo_secure' },
  semanticSearchTool: { name: 'semantic_search_secure' },
  workspaceSourcesSearchTool: { name: 'query_workspace_sources' },
}));
jest.mock('@/lib/agents/tools/workspaceTools', () => ({
  workspaceListTool: { name: 'workspace_list' },
  workspaceDescribeTool: { name: 'workspace_describe' },
}));

import { buildAuthorizedToolSet, registryFromTools } from '@/lib/agents/core/agenticToolSet';
import { buildCapabilityManifest } from '@/lib/agents/core/capabilityManifest';
import {
  getConnections,
  resolveConnectionCredential,
  ConnectionLookupError,
} from '@/lib/integrations/connectionService';
import { getOctokit } from '@/lib/github';

const ctx = { userId: 'u1', sessionId: 's1', workspaceId: undefined, userRole: 'user' } as any;

// Harness-less, workspace-less agentic run — the parity shape for #444.
const MANIFEST = buildCapabilityManifest({
  resolvedMode: 'agentic',
  workspaceId: null,
  surface: 'web',
  memoryReadEnabled: false,
  webResearchEnabled: false,
  ioHarnessPresent: false,
});

function octokitStub(listImpl: jest.Mock) {
  (getOctokit as jest.Mock).mockReturnValue({
    rest: { repos: { listForAuthenticatedUser: listImpl } },
  });
}

const repo = (id: number, name: string) => ({
  id,
  full_name: name,
  private: false,
  description: null,
  language: 'TypeScript',
  updated_at: '2026-10-20T00:00:00Z',
  html_url: `https://github.com/${name}`,
  owner: { login: 'jj-em' },
});

beforeEach(() => {
  (getConnections as jest.Mock).mockReset();
  (resolveConnectionCredential as jest.Mock).mockReset();
  (getOctokit as jest.Mock).mockReset();
});

describe('catalog parity: connection tools are identity-gated (#444)', () => {
  it('a harness-less, workspace-less run exposes both connection tools', () => {
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    expect(registry.getToolNames()).toContain('connections_list');
    expect(registry.getToolNames()).toContain('github_list_repositories');
  });
});

describe('acceptance journey: "Which tools have I connected?" → "Show my GitHub repositories."', () => {
  it('inventory reports GitHub as unverified; the authenticated listing verifies it', async () => {
    (getConnections as jest.Mock).mockResolvedValue([
      { service: 'github', status: 'unverified', login: 'jj-em', updatedAt: '2026-10-01T00:00:00Z' },
    ]);
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    const listImpl = jest.fn().mockResolvedValue({
      data: [repo(1, 'jj-em/ai-saas'), repo(2, 'jj-em/notes')],
      headers: { 'x-github-request-id': 'GH-REQ-1' },
    });
    octokitStub(listImpl);

    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));

    // Step 1: "Which tools have I connected?" — inventory, no provider calls.
    const inventory = await registry.executeTool('connections_list', {}, ctx);
    expect(inventory.success).toBe(true);
    expect(inventory.data.success).toBe(true);
    expect(inventory.data.data.connections[0]).toMatchObject({ service: 'github', status: 'unverified' });
    expect(getOctokit).not.toHaveBeenCalled();

    // Step 2: "Show my GitHub repositories." — the caller's own credential.
    const listing = await registry.executeTool('github_list_repositories', { perPage: 2 }, ctx);
    expect(listing.success).toBe(true);
    expect(listing.data.success).toBe(true);
    expect(resolveConnectionCredential).toHaveBeenCalledWith('u1', 'github');
    expect(listing.data.data.repositories).toHaveLength(2);
    expect(listing.data.data.repositories[0]).toMatchObject({ fullName: 'jj-em/ai-saas', owner: 'jj-em' });
    expect(listing.data.data.connectionStatus).toBe('connected_verified');
    expect(listing.data.data.verification).toMatchObject({
      method: 'github:repos.listForAuthenticatedUser',
      account: 'jj-em',
      requestId: 'GH-REQ-1',
    });
    expect(Date.parse(listing.data.data.verification.verifiedAt)).not.toBeNaN();
  });
});

describe('acceptance cases through the real registry (#444)', () => {
  it('no credential → not_connected, and no provider request is made', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue(null);
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(result.data.success).toBe(false);
    expect(result.data.data.connectionStatus).toBe('not_connected');
    expect(getOctokit).not.toHaveBeenCalled();
  });

  it('empty results → successful access, zero repositories, still verified', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    octokitStub(jest.fn().mockResolvedValue({ data: [], headers: {} }));
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', { perPage: 30 }, ctx);
    expect(result.data.success).toBe(true);
    expect(result.data.data.repositories).toEqual([]);
    expect(result.data.data.pagination.hasMore).toBe(false);
    expect(result.data.data.connectionStatus).toBe('connected_verified');
    expect(Date.parse(result.data.data.verification.verifiedAt)).not.toBeNaN();
  });

  it('revoked credential (401) → reconnect required on the next operation', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    octokitStub(jest.fn().mockRejectedValue({ status: 401, message: 'Bad credentials' }));
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(result.data.success).toBe(false);
    expect(result.data.data.connectionStatus).toBe('expired_reconnect_required');
    expect(String(result.data.error)).toContain('Reconnect');
  });

  it('rate limit (403 + exhausted header) stays distinguishable from authorization failure', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    octokitStub(
      jest.fn().mockRejectedValue({ status: 403, message: 'rate limited', headers: { 'x-ratelimit-remaining': '0' } }),
    );
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(result.data.data.connectionStatus).toBe('provider_unavailable');
    expect(result.data.data.connectionStatus).not.toBe('access_denied');
  });

  it('a plain 403 is access_denied', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    octokitStub(jest.fn().mockRejectedValue({ status: 403, headers: { 'x-ratelimit-remaining': '4900' } }));
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(result.data.data.connectionStatus).toBe('access_denied');
  });

  it('pagination: a full page reports hasMore + nextPage; a partial page is never "all"', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue({ service: 'github', token: 't' });
    octokitStub(jest.fn().mockResolvedValue({ data: [repo(1, 'a'), repo(2, 'b')], headers: {} }));
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const full = await registry.executeTool('github_list_repositories', { page: 1, perPage: 2 }, ctx);
    expect(full.data.data.pagination).toMatchObject({ hasMore: true, nextPage: 2 });
    expect(String(full.data.data.pagination.note)).toContain('not the complete list');

    octokitStub(jest.fn().mockResolvedValue({ data: [repo(3, 'c')], headers: {} }));
    const partial = await registry.executeTool('github_list_repositories', { page: 2, perPage: 2 }, ctx);
    expect(partial.data.data.pagination).toMatchObject({ hasMore: false, nextPage: null });
    expect(String(partial.data.data.pagination.note)).toContain('no further pages');
  });

  it('another user\'s credential is inaccessible: resolution uses the caller identity only', async () => {
    (resolveConnectionCredential as jest.Mock).mockResolvedValue(null); // u1 has no row; someone else's row exists
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(resolveConnectionCredential).toHaveBeenCalledWith('u1', 'github');
    expect(result.data.data.connectionStatus).toBe('not_connected');
    expect(getOctokit).not.toHaveBeenCalled();
  });

  it('decryption failure surfaces as a distinct typed failure, not not_connected', async () => {
    (resolveConnectionCredential as jest.Mock).mockRejectedValue(
      new ConnectionLookupError('stored credential undecryptable', 'DECRYPTION_FAILED'),
    );
    const registry = registryFromTools(buildAuthorizedToolSet(MANIFEST));
    const result = await registry.executeTool('github_list_repositories', {}, ctx);
    expect(result.data.success).toBe(false);
    expect(String(result.data.error)).toContain('DECRYPTION_FAILED');
    expect(getOctokit).not.toHaveBeenCalled();
  });
});
