import { ToolRegistry } from '@/lib/agents/core/registry';
import {
  buildCapabilityManifest,
  buildWeaverSystemInstruction,
  logCapabilityResolution,
  type CapabilityManifest,
} from '@/lib/agents/core/capabilityManifest';

/**
 * Builds the worker's authorized agentic runtime (Phase 0 #440): the tool
 * registry AND the manifest-derived system instruction, from the SAME
 * manifest-gated builder the web engine uses — parity by construction.
 *
 * The worker supplies no ioHarness (src/trigger/_context.ts), and every
 * harness/intelligence tool refuses at execute-time without one, so the
 * effective catalog is the base set and the manifest reports those
 * capabilities as unavailable — never as available-but-failing.
 */
export async function buildAgenticRuntime(ctx: {
  userId?: string;
  workspaceId?: string | null;
  requestId?: string;
  conversationId?: string;
}): Promise<{ registry: ToolRegistry; manifest: CapabilityManifest; systemInstruction: string }> {
  const manifest: CapabilityManifest = buildCapabilityManifest({
    resolvedMode: 'agentic',
    workspaceId: ctx.workspaceId ?? null,
    surface: 'trigger-worker',
    preparedContextEnabled: false,
    webResearchEnabled: false,
    ioHarnessPresent: false,
  });
  const { buildAuthorizedToolSet, registryFromTools } = await import('@/lib/agents/core/agenticToolSet');
  const registry = registryFromTools(buildAuthorizedToolSet(manifest));
  const systemInstruction = buildWeaverSystemInstruction(manifest);
  void logCapabilityResolution({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId ?? undefined,
    requestId: ctx.requestId,
    conversationId: ctx.conversationId,
    manifest,
    toolNames: registry.getToolNames(),
  });
  return { registry, manifest, systemInstruction };
}