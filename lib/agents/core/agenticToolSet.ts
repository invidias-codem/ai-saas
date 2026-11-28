// lib/agents/core/agenticToolSet.ts
// Stable re-entry point for the agentic tool set.
//
// The ReAct loop registers its tools inline per request (see conversationEngine
// agentic branch). For durable HITL resume we need the SAME tool definitions
// available from a fresh (cold-start) process, so this module re-imports the
// module-level `...Tool` constants and registers them into a `ToolRegistry`.
// Tool definitions are deterministic module constants, so a paused tool can be
// re-hydrated by name after a serverless cold start.

import { ToolRegistry } from './registry';
import type { Tool } from './types';

export const AGENTIC_TOOLS: Tool[] = (() => {
  const { dealSentinelTool } = require('@/lib/agents/tools/dealSentinel');
  const { webSearchTool } = require('@/lib/agents/tools/webSearch');
  const { researchWriterTool } = require('@/lib/agents/tools/researchWriter');
  const { novelWriterTool } = require('@/lib/agents/tools/novelWriter');
  const { searchCodebaseTool } = require('@/lib/agents/tools/searchCodebase');
  const { generateMusicTool } = require('@/lib/agents/tools/generateMusic');
  const { generateImageTool } = require('@/lib/agents/tools/generateImage');
  const { generateVideoTool } = require('@/lib/agents/tools/generateVideo');
  const { readFileTool, writeFileTool, patchFileTool } = require('@/lib/agents/tools/harnessTools');
  const { executeCommandTool } = require('@/lib/agents/tools/executionTools');
  const {
    discoverDocumentsTool,
    extractTextTool,
    summarizeRepoTool,
    semanticSearchTool,
    workspaceSourcesSearchTool,
  } = require('@/lib/agents/tools/intelligenceTools');
  const { workspaceListTool, workspaceDescribeTool } = require('@/lib/agents/tools/workspaceTools');
  const { connectionsListTool, githubListRepositoriesTool } = require('@/lib/agents/tools/connectionTools');

  return [
    dealSentinelTool,
    webSearchTool,
    researchWriterTool,
    novelWriterTool,
    searchCodebaseTool,
    generateMusicTool,
    generateImageTool,
    generateVideoTool,
    readFileTool,
    writeFileTool,
    patchFileTool,
    executeCommandTool,
    discoverDocumentsTool,
    extractTextTool,
    summarizeRepoTool,
    semanticSearchTool,
    workspaceSourcesSearchTool,
    workspaceListTool,
    workspaceDescribeTool,
    connectionsListTool,
    githubListRepositoriesTool,
  ] as Tool[];
})();

/** Build a fresh registry pre-populated with every agentic tool. */
export function buildAgenticRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of AGENTIC_TOOLS) {
    registry.register(tool);
  }
  return registry;
}

/** Resolve a single agentic tool by name (null if unknown). */
export function resolveAgenticTool(name: string): Tool | undefined {
  return AGENTIC_TOOLS.find((t) => t.name === name);
}

// ── Phase 0 (#440): authorization-aware catalog ──────────────────────────────
// Gating follows the manifest's EFFECTIVE execution capabilities: the harness
// tools and the intelligence tools each refuse at execute-time without
// context.ioHarness, so a surface that supplies no harness must not expose
// them. ponytail: profile-level narrowing (tool_use_level) lands with Phase 1
// unification.

import type { CapabilityManifest } from './capabilityManifest';

const BASE_TOOL_NAMES = [
  'analyze_and_negotiate_quote',
  'web_search',
  'write_research_paper',
  'write_creative_content',
  'search_codebase',
  'generate_music',
  'generate_image',
  'generate_video',
] as const;

const HARNESS_TOOL_NAMES = ['read_file', 'write_file', 'patch_file', 'execute_command'] as const;

// LOCAL discovery tools — all four refuse at execute-time without
// context.ioHarness. Server-side source search is gated separately below.
const INTELLIGENCE_TOOL_NAMES = [
  'discover_documents_secure',
  'extract_text_secure',
  'summarize_repo_secure',
  'semantic_search_secure',
] as const;

const SOURCE_SEARCH_TOOL_NAMES = ['query_workspace_sources'] as const;

// Phase 1 (#442): read-only discovery tools — server-side, identity-gated.
const WORKSPACE_DISCOVERY_TOOL_NAMES = ['workspace_list', 'workspace_describe'] as const;

// Phase 2A (#444): connection discovery + read-only GitHub access —
// server-side, identity-gated (the credential resolves from the authenticated
// runtime identity only). Independent of harness presence or workspace.
const CONNECTION_TOOL_NAMES = ['connections_list', 'github_list_repositories'] as const;

/**
 * The single authorized tool-set builder. Both the web engine
 * (conversationEngine agentic branch) and the Trigger.dev worker
 * (_registry.ts) MUST route through this — identical manifest inputs
 * produce identical catalogs (web/worker parity contract). Advertised
 * capabilities and the filtered catalog agree by construction: the harness
 * tools exist iff agentic_harness is available; the LOCAL discovery tools
 * iff workspace_intelligence is available (all four refuse without
 * context.ioHarness); query_workspace_sources is SERVER-SIDE source search
 * (#440 review finding 1: it guards on workspace/user only, no harness) and
 * follows workspace_source_search.
 */
export function buildAuthorizedToolSet(manifest: CapabilityManifest): Tool[] {
  const harness =
    manifest.capabilities.agentic_harness === 'available' ? [...HARNESS_TOOL_NAMES] : [];
  const intelligence =
    manifest.capabilities.workspace_intelligence === 'available'
      ? [...INTELLIGENCE_TOOL_NAMES]
      : [];
  const sourceSearch =
    manifest.capabilities.workspace_source_search === 'available' ? [...SOURCE_SEARCH_TOOL_NAMES] : [];
  const discovery =
    manifest.capabilities.workspace_discovery === 'available'
      ? [...WORKSPACE_DISCOVERY_TOOL_NAMES]
      : [];
  const connections =
    manifest.capabilities.connection_discovery === 'available' ? [...CONNECTION_TOOL_NAMES] : [];
  const names = new Set<string>([
    ...BASE_TOOL_NAMES,
    ...harness,
    ...intelligence,
    ...sourceSearch,
    ...discovery,
    ...connections,
  ]);
  return AGENTIC_TOOLS.filter((t) => names.has(t.name));
}

/** Register a tool list into a fresh ToolRegistry. */
export function registryFromTools(tools: Tool[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}