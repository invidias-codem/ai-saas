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
// The base set is registered for every agentic run; harness + intelligence
// tools require the manifest's agentic capabilities (resolved runtime mode).
// ponytail: capability flags currently derive from resolved mode only;
// profile-level narrowing (tool_use_level) lands with Phase 1 unification.

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

const EXTENDED_TOOL_NAMES = [
  'read_file',
  'write_file',
  'patch_file',
  'execute_command',
  'discover_documents_secure',
  'extract_text_secure',
  'summarize_repo_secure',
  'semantic_search_secure',
  'query_workspace_sources',
] as const;

/**
 * The single authorized tool-set builder. Both the web engine
 * (conversationEngine agentic branch) and the Trigger.dev worker
 * (_registry.ts) MUST route through this — identical manifest inputs
 * produce identical catalogs (web/worker parity contract).
 */
export function buildAuthorizedToolSet(manifest: import('./capabilityManifest').CapabilityManifest): Tool[] {
  const allowExtended =
    manifest.capabilities.agentic_harness === 'available' &&
    manifest.capabilities.workspace_intelligence === 'available';
  const names = new Set<string>(
    allowExtended ? [...BASE_TOOL_NAMES, ...EXTENDED_TOOL_NAMES] : [...BASE_TOOL_NAMES],
  );
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