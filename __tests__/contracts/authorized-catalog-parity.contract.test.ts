/**
 * Phase 0+1 (#440 + #442) — web/worker authorized-catalog parity contracts.
 *
 * Tool modules are mocked to name-only stubs: the contract under test is the
 * CATALOG COMPOSITION (who gets which tools), not the tools' internals.
 *
 * Locked here:
 *  - Parity compares EQUIVALENT effective capabilities, not a fixed count.
 *  - The worker supplies no ioHarness; the harness tools and the four LOCAL
 *    discovery tools refuse at execute-time without one. query_workspace_sources
 *    and the Phase 1 discovery tools are SERVER-SIDE (identity/workspace guards,
 *    no harness) and stay exposed on the worker.
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
jest.mock('@/lib/agents/tools/workspaceTools', () => ({
  workspaceListTool: { name: 'workspace_list' },
  workspaceDescribeTool: { name: 'workspace_describe' },
}));
jest.mock('@/lib/telemetry', () => ({ logEvent: jest.fn() }));

import { buildAuthorizedToolSet } from '@/lib/agents/core/agenticToolSet';
import { buildAgenticRuntime } from '@/src/trigger/_registry';
import {
  buildCapabilityManifest,
  buildWeaverSystemInstruction,
  type CapabilityManifest,
} from '@/lib/agents/core/capabilityManifest';

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

const HARNESS = ['read_file', 'write_file', 'patch_file', 'execute_command'];

const INTELLIGENCE = [
  'discover_documents_secure',
  'extract_text_secure',
  'summarize_repo_secure',
  'semantic_search_secure',
];

const SOURCE_SEARCH = ['query_workspace_sources'];

// Phase 1 (#442): identity-gated, server-side discovery tools.
const DISCOVERY = ['workspace_list', 'workspace_describe'];

const sorted = (names: string[]) => [...names].sort();
const catalogNames = (manifest: CapabilityManifest) =>
  sorted(buildAuthorizedToolSet(manifest).map((t) => t.name));

const WEB_FULL = {
  resolvedMode: 'agentic' as const,
  workspaceId: 'ws_1',
  surface: 'web' as const,
  memoryReadEnabled: true,
  webResearchEnabled: true,
  ioHarnessPresent: true,
};

describe('parity compares equivalent effective capabilities (#440 + #442)', () => {
  it('equivalent inputs produce identical capabilities and identical catalogs across surfaces', () => {
    const webManifest = buildCapabilityManifest(WEB_FULL);
    const workerEquivalent = buildCapabilityManifest({
      ...WEB_FULL,
      surface: 'trigger-worker',
    });
    expect(workerEquivalent.capabilities).toEqual(webManifest.capabilities);
    expect(catalogNames(workerEquivalent)).toEqual(catalogNames(webManifest));
  });

  it('the real worker runtime exposes base + server-side tools (11) — every exposed tool is executable there', async () => {
    const runtime = await buildAgenticRuntime({
      userId: 'u1',
      workspaceId: 'ws_1',
      requestId: 'req-1',
      conversationId: 'conv-1',
    });
    expect(sorted(runtime.registry.getToolNames())).toEqual(
      sorted([...BASE, ...SOURCE_SEARCH, ...DISCOVERY]),
    );
    expect(runtime.registry.getToolNames()).toHaveLength(11);
    expect(runtime.manifest.capabilities.agentic_harness).toBe('unavailable');
    expect(runtime.manifest.capabilities.workspace_intelligence).toBe('unavailable');
    expect(runtime.manifest.capabilities.workspace_source_search).toBe('available');
    expect(runtime.manifest.capabilities.workspace_discovery).toBe('available');
  });

  it('a worker run with no workspace keeps source search (explicit target) and discovery', async () => {
    const runtime = await buildAgenticRuntime({ userId: 'u1', workspaceId: null });
    expect(sorted(runtime.registry.getToolNames())).toEqual(
      sorted([...BASE, ...SOURCE_SEARCH, ...DISCOVERY]),
    );
    expect(runtime.manifest.capabilities.workspace_source_search).toBe('available');
    expect(runtime.manifest.capabilities.workspace_discovery).toBe('available');
  });

  it('the worker instruction agrees with the worker catalog', async () => {
    const runtime = await buildAgenticRuntime({ userId: 'u1', workspaceId: 'ws_1' });
    expect(runtime.systemInstruction).toContain('no execution harness connected');
    expect(runtime.systemInstruction).toContain('Workspace source search: available through the query_workspace_sources tool');
    expect(runtime.systemInstruction).toContain('Workspace discovery: available');
    expect(runtime.systemInstruction).toContain('You are Weaver');
  });

  it('the web agentic surface WITH harness exposes the full set', () => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    expect(catalogNames(manifest)).toEqual(
      sorted([...BASE, ...HARNESS, ...INTELLIGENCE, ...SOURCE_SEARCH, ...DISCOVERY]),
    );
    expect(catalogNames(manifest)).toHaveLength(19);
  });

  it('a web agentic run WITHOUT a harness keeps local discovery off; server-side tools stay on', () => {
    const manifest = buildCapabilityManifest({ ...WEB_FULL, ioHarnessPresent: false });
    expect(catalogNames(manifest)).toEqual(sorted([...BASE, ...SOURCE_SEARCH, ...DISCOVERY]));
  });

  it('a non-agentic resolved mode yields the base set only — no broadening', () => {
    const manifest = buildCapabilityManifest({ ...WEB_FULL, resolvedMode: 'fast' });
    expect(catalogNames(manifest)).toEqual(sorted(BASE));
  });
});

describe('advertised capabilities agree with the filtered catalog (#440 review finding 3)', () => {
  const statuses = ['available', 'unavailable', 'unsupported', 'unknown'] as const;

  it.each(statuses)('agentic_harness=%s → harness tools present iff available', (status) => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    manifest.capabilities.agentic_harness = status;
    const names = catalogNames(manifest);
    if (status === 'available') {
      expect(names).toEqual(expect.arrayContaining(HARNESS));
    } else {
      for (const tool of HARNESS) {
        expect(names).not.toContain(tool);
      }
      // Gating is independent: server-side tools remain.
      expect(names).toEqual(sorted([...BASE, ...INTELLIGENCE, ...SOURCE_SEARCH, ...DISCOVERY]));
    }
  });

  it.each(statuses)('workspace_intelligence=%s → local discovery tools present iff available', (status) => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    manifest.capabilities.workspace_intelligence = status;
    const names = catalogNames(manifest);
    if (status === 'available') {
      expect(names).toEqual(expect.arrayContaining(INTELLIGENCE));
    } else {
      for (const tool of INTELLIGENCE) {
        expect(names).not.toContain(tool);
      }
      expect(names).toEqual(sorted([...BASE, ...HARNESS, ...SOURCE_SEARCH, ...DISCOVERY]));
    }
  });

  it.each(statuses)('workspace_source_search=%s → query_workspace_sources present iff available', (status) => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    manifest.capabilities.workspace_source_search = status;
    const names = catalogNames(manifest);
    if (status === 'available') {
      expect(names).toEqual(expect.arrayContaining(SOURCE_SEARCH));
    } else {
      for (const tool of SOURCE_SEARCH) {
        expect(names).not.toContain(tool);
      }
      expect(names).toEqual(sorted([...BASE, ...HARNESS, ...INTELLIGENCE, ...DISCOVERY]));
    }
  });

  it.each(statuses)('workspace_discovery=%s → discovery tools present iff available (#442)', (status) => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    manifest.capabilities.workspace_discovery = status;
    const names = catalogNames(manifest);
    if (status === 'available') {
      expect(names).toEqual(expect.arrayContaining(DISCOVERY));
    } else {
      for (const tool of DISCOVERY) {
        expect(names).not.toContain(tool);
      }
      expect(names).toEqual(sorted([...BASE, ...HARNESS, ...INTELLIGENCE, ...SOURCE_SEARCH]));
    }
  });

  it('the instruction never advertises a capability the catalog does not carry', () => {
    const withHarness = buildWeaverSystemInstruction(buildCapabilityManifest(WEB_FULL));
    expect(withHarness).toContain('Agentic tool use: this session runs with the file and execution tools');
    const withoutHarness = buildWeaverSystemInstruction(
      buildCapabilityManifest({ ...WEB_FULL, ioHarnessPresent: false }),
    );
    expect(withoutHarness).toContain('Agentic tool use: not available in this session');
  });
});
