/**
 * Phase 0 (#440 + review) — web/worker authorized-catalog parity contracts.
 *
 * Tool modules are mocked to name-only stubs: the contract under test is the
 * CATALOG COMPOSITION (who gets which tools), not the tools' internals.
 *
 * Review corrections locked here:
 *  - Parity compares EQUIVALENT effective capabilities, not a fixed count.
 *  - The worker supplies no ioHarness, and every harness/intelligence tool
 *    refuses at execute-time without one, so the worker's effective catalog
 *    is the base set — advertised and exposed must agree.
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
  'query_workspace_sources',
];

const sorted = (names: string[]) => [...names].sort();
const catalogNames = (manifest: CapabilityManifest) =>
  sorted(buildAuthorizedToolSet(manifest).map((t) => t.name));

const WEB_FULL = {
  resolvedMode: 'agentic' as const,
  workspaceId: 'ws_1',
  surface: 'web' as const,
  preparedContextEnabled: true,
  webResearchEnabled: true,
  ioHarnessPresent: true,
};

describe('parity compares equivalent effective capabilities (#440 review finding 2)', () => {
  it('equivalent inputs produce identical capabilities and identical catalogs across surfaces', () => {
    const webManifest = buildCapabilityManifest(WEB_FULL);
    const workerEquivalent = buildCapabilityManifest({
      ...WEB_FULL,
      surface: 'trigger-worker',
    });
    expect(workerEquivalent.capabilities).toEqual(webManifest.capabilities);
    expect(catalogNames(workerEquivalent)).toEqual(catalogNames(webManifest));
  });

  it('the real worker runtime (no ioHarness) exposes the base set — not the 17-tool blanket', async () => {
    const runtime = await buildAgenticRuntime({
      userId: 'u1',
      workspaceId: 'ws_1',
      requestId: 'req-1',
      conversationId: 'conv-1',
    });
    expect(sorted(runtime.registry.getToolNames())).toEqual(sorted(BASE));
    expect(runtime.registry.getToolNames()).toHaveLength(8);
    expect(runtime.manifest.capabilities.agentic_harness).toBe('unavailable');
    expect(runtime.manifest.capabilities.workspace_intelligence).toBe('unavailable');
  });

  it('the worker instruction agrees with the worker catalog (no harness wording)', async () => {
    const runtime = await buildAgenticRuntime({ userId: 'u1', workspaceId: 'ws_1' });
    expect(runtime.systemInstruction).toContain('no execution harness connected');
    expect(runtime.systemInstruction).toContain('You are Weaver');
  });

  it('the web agentic surface WITH harness exposes the full set', () => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    expect(catalogNames(manifest)).toEqual(sorted([...BASE, ...HARNESS, ...INTELLIGENCE]));
    expect(catalogNames(manifest)).toHaveLength(17);
  });

  it('a non-agentic resolved mode yields the base set only — no broadening', () => {
    const manifest = buildCapabilityManifest({ ...WEB_FULL, resolvedMode: 'fast' });
    expect(catalogNames(manifest)).toEqual(sorted(BASE));
  });
});

describe('advertised capabilities agree with the filtered catalog (#440 review finding 3)', () => {
  const harnessStatuses = ['available', 'unavailable', 'unsupported', 'unknown'] as const;

  it.each(harnessStatuses)('agentic_harness=%s → harness tools present iff available', (status) => {
    const manifest = buildCapabilityManifest(WEB_FULL);
    manifest.capabilities.agentic_harness = status;
    const names = catalogNames(manifest);
    if (status === 'available') {
      expect(names).toEqual(expect.arrayContaining(HARNESS));
    } else {
      for (const tool of HARNESS) {
        expect(names).not.toContain(tool);
      }
      // Intelligence gating is independent: with only agentic_harness down,
      // the intelligence tools remain exposed.
      expect(names).toEqual(sorted([...BASE, ...INTELLIGENCE]));
    }
  });

  it.each(harnessStatuses)(
    'workspace_intelligence=%s → intelligence tools present iff available',
    (status) => {
      const manifest = buildCapabilityManifest(WEB_FULL);
      manifest.capabilities.workspace_intelligence = status;
      const names = catalogNames(manifest);
      if (status === 'available') {
        expect(names).toEqual(expect.arrayContaining(INTELLIGENCE));
      } else {
        for (const tool of INTELLIGENCE) {
          expect(names).not.toContain(tool);
        }
        expect(names).toEqual(sorted([...BASE, ...HARNESS]));
      }
    },
  );

  it('the instruction never advertises a harness the catalog does not carry', () => {
    const withHarness = buildWeaverSystemInstruction(buildCapabilityManifest(WEB_FULL));
    expect(withHarness).toContain('Agentic tool use: this session runs with the file and execution tools');
    const withoutHarness = buildWeaverSystemInstruction(
      buildCapabilityManifest({ ...WEB_FULL, ioHarnessPresent: false }),
    );
    expect(withoutHarness).toContain('Agentic tool use: not available in this session');
  });
});
