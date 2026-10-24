import { ToolRegistry } from '@/lib/agents/core/registry';
import {
  buildCapabilityManifest,
  logCapabilityResolution,
  type CapabilityManifest,
} from '@/lib/agents/core/capabilityManifest';

/**
 * Builds the agentic ToolRegistry on the Trigger.dev worker (Phase 0 #440).
 *
 * Delegates to the SAME manifest-gated builder the web engine uses
 * (lib/agents/core/agenticToolSet.buildAuthorizedToolSet), so web and worker
 * construct identical catalogs for identical resolved contexts — parity by
 * construction, never widened. Tools are stable module constants; nothing is
 * ever serialized across the task boundary.
 */
export async function buildAgenticRegistry(
  mode: 'agentic',
  ctx?: { userId?: string; workspaceId?: string | null },
): Promise<ToolRegistry> {
  const manifest: CapabilityManifest = buildCapabilityManifest({
    resolvedMode: mode,
    workspaceId: ctx?.workspaceId ?? null,
    backgroundWebResearchEnabled: process.env.ENABLE_WEB_RESEARCH === 'true',
    longTermMemoryEnabled: process.env.ENABLE_HEAVY_CONTEXT !== 'false',
  });
  const { buildAuthorizedToolSet, registryFromTools } = await import('@/lib/agents/core/agenticToolSet');
  const registry = registryFromTools(buildAuthorizedToolSet(manifest));
  void logCapabilityResolution({
    userId: ctx?.userId,
    workspaceId: ctx?.workspaceId ?? undefined,
    manifest,
    surface: 'trigger-worker',
    toolNames: registry.getToolNames(),
  });
  return registry;
}