/**
 * Phase 0 (#440) — web/worker authorized-catalog parity contracts.
 *
 * Tool modules are mocked to name-only stubs: the contract under test is the
 * CATALOG COMPOSITION (who gets which tools), not the tools' internals.
 * Parity is derived from the resolved runtime mode + manifest capabilities —
 * registering all tools everywhere would broaden access and is explicitly
 * rejected by #440.
 */
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
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

import { buildAuthorizedToolSet } from '@/lib/agents/core/agenticToolSet';
import { buildAgenticRegistry } from '@/src/trigger/_registry';
import { buildCapabilityManifest } from '@/lib/agents/core/capabilityManifest';

const AGENTIC_INPUT = {
  resolvedMode: 'agentic' as const,
  workspaceId: 'ws_1',
  backgroundWebResearchEnabled: true,
  longTermMemoryEnabled: true,
};

const BASE = [
  'analyze_and_negotiate_quote',
  'web_search',
  'write_research_paper',
  'write_creative_content',
  'search_codebase',
  'generate_music',
  'generate_image',
  'generate_video',
];

const EXTENDED = [
  'read_file',
  'write_file',
  'patch_file',
  'execute_command',
  'discover_documents_secure',
  'extract_text_secure',
  'summarize_repo_secure',
  'semantic_search_secure',
  'query_workspace_sources',
];

const sorted = (names: string[]) => [...names].sort();

describe('web/worker parity — identical resolved context, identical catalog (#440)', () => {
  it('web builder and worker buildAgenticRegistry expose the same names for the same resolved mode', async () => {
    const manifest = buildCapabilityManifest(AGENTIC_INPUT);
    const webNames = sorted(buildAuthorizedToolSet(manifest).map((t) => t.name));
    const workerRegistry = await buildAgenticRegistry('agentic', {
      userId: 'user_1',
      workspaceId: 'ws_1',
    });
    expect(sorted(workerRegistry.getToolNames())).toEqual(webNames);
  });

  it('the same resolved agentic conversation yields the full 17-tool catalog on both surfaces', async () => {
    const webNames = sorted(buildAuthorizedToolSet(buildCapabilityManifest(AGENTIC_INPUT)).map((t) => t.name));
    expect(webNames).toEqual(sorted([...BASE, ...EXTENDED]));
    expect(webNames).toHaveLength(17);
    const workerRegistry = await buildAgenticRegistry('agentic', {
      userId: 'user_1',
      workspaceId: 'ws_1',
    });
    expect(workerRegistry.getToolNames()).toHaveLength(17);
  });
});

describe('parity is authorization-aware, not blanket registration (#440)', () => {
  it('a non-agentic resolved mode yields the base set only — no harness, no intelligence tools', () => {
    const manifest = buildCapabilityManifest({ ...AGENTIC_INPUT, resolvedMode: 'fast' });
    const names = sorted(buildAuthorizedToolSet(manifest).map((t) => t.name));
    expect(names).toEqual(sorted(BASE));
    expect(names).not.toContain('read_file');
    expect(names).not.toContain('execute_command');
    expect(names).not.toContain('query_workspace_sources');
  });

  it('workspace presence does not gate the harness — the resolved mode does', () => {
    const noWorkspace = buildCapabilityManifest({ ...AGENTIC_INPUT, workspaceId: null });
    expect(buildAuthorizedToolSet(noWorkspace)).toHaveLength(17);
  });

  it('extended tools disappear when the manifest marks them unsupported', () => {
    const manifest = buildCapabilityManifest(AGENTIC_INPUT);
    manifest.capabilities.agentic_harness = 'unsupported';
    const names = sorted(buildAuthorizedToolSet(manifest).map((t) => t.name));
    expect(names).toEqual(sorted(BASE));
  });
});
