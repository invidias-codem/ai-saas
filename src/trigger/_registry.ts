import { ToolRegistry } from '@/lib/agents/core/registry';

/**
 * Rebuilds the agentic ToolRegistry on the Trigger.dev worker from stable
 * module-level tool constants.
 *
 * This is duplicated from the agentic branch of `generateConversationReply`
 * (lib/llm/conversationEngine.ts) ON PURPOSE: the task worker runs outside the
 * request lifecycle, so it cannot inherit the route's in-memory registry. The
 * tools themselves are stable module singletons — safe to re-register here by
 * importing them directly (never serialized across the task boundary).
 */
export async function buildAgenticRegistry(mode: 'agentic'): Promise<ToolRegistry> {
  const { dealSentinelTool } = await import('@/lib/agents/tools/dealSentinel');
  const { webSearchTool } = await import('@/lib/agents/tools/webSearch');
  const { researchWriterTool } = await import('@/lib/agents/tools/researchWriter');
  const { novelWriterTool } = await import('@/lib/agents/tools/novelWriter');
  const { searchCodebaseTool } = await import('@/lib/agents/tools/searchCodebase');
  const { generateMusicTool } = await import('@/lib/agents/tools/generateMusic');
  const { generateImageTool } = await import('@/lib/agents/tools/generateImage');
  const { generateVideoTool } = await import('@/lib/agents/tools/generateVideo');
  const { readFileTool, writeFileTool, patchFileTool } = await import('@/lib/agents/tools/harnessTools');
  const { executeCommandTool } = await import('@/lib/agents/tools/executionTools');
  const {
    discoverDocumentsTool,
    extractTextTool,
    summarizeRepoTool,
    semanticSearchTool,
    workspaceSourcesSearchTool,
  } = await import('@/lib/agents/tools/intelligenceTools');

  const registry = new ToolRegistry();
  registry.register(dealSentinelTool);
  registry.register(webSearchTool);
  registry.register(researchWriterTool);
  registry.register(novelWriterTool);
  registry.register(searchCodebaseTool);
  registry.register(generateMusicTool);
  registry.register(generateImageTool);
  registry.register(generateVideoTool);

  // Phase 1: Local Mutable Capabilities
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(patchFileTool);
  registry.register(executeCommandTool);

  // Phase 3 & 4: Intelligence Capabilities
  registry.register(discoverDocumentsTool);
  registry.register(extractTextTool);
  registry.register(summarizeRepoTool);
  registry.register(semanticSearchTool);
  registry.register(workspaceSourcesSearchTool);

  return registry;
}