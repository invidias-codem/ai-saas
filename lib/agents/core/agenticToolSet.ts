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