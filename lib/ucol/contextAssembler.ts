import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

function triggerNonBlockingEviction(): void {
  if (!supabaseAdmin) return;
  void (async () => {
    try {
      const { data, error } = await supabaseAdmin.rpc('purge_expired_workspace_memories');
      if (error) throw error;
    } catch {
      // swallow to isolate runtime path
    }
  })();
}

export interface ContextNode {
  id: string;
  type: 'core_system' | 'trust_boundary' | 'telemetry_eval' | 'workspace_memory';
  priority: number;
  content: string;
  estimatedTokens: number;
}

export interface AssembleContextOptions {
  orgContext: {
    orgId: string;
    userId: string;
    role?: string;
    permissions: string[];
  };
  workspaceId: string;
  taskPrompt: string;
  tokenBudget?: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildTrustBoundaryNode(orgContext: AssembleContextOptions['orgContext']): ContextNode {
  const canUseSensitiveTools = orgContext.permissions.includes('sensitive_tools:use');
  const canUseExternalActions = orgContext.permissions.includes('external_actions:use');
  const trustBoundaryContent = [
    `Role: Lattice OS Agentic Task Executive.`,
    `Organization Role: ${orgContext.role ?? 'unknown'}`,
    `Permissions:`,
    `- Sensitive Tools: ${canUseSensitiveTools ? 'ALLOWED' : 'DENIED'}`,
    `- External Actions: ${canUseExternalActions ? 'ALLOWED' : 'DENIED'}`,
    `Policy: Intercepted tool denials must be treated as execution feedback. Re-plan accordingly.`,
  ].join('\n');

  return {
    id: 'core_trust_boundary',
    type: 'trust_boundary',
    priority: 100,
    content: trustBoundaryContent,
    estimatedTokens: estimateTokens(trustBoundaryContent),
  };
}

function buildTelemetryEvalNode(orgContext: AssembleContextOptions['orgContext']): ContextNode | null {
  try {
    if (!supabaseAdmin) return null;
    const q = supabaseAdmin
      .from('audit_log')
      .select('harness, payload')
      .eq('org_id', orgContext.orgId)
      .eq('event_type', 'tool.intercepted')
      .order('created_at', { ascending: false })
      .limit(3);

    const { data: traceLogs } = q as any;
    if (traceLogs && traceLogs.length > 0) {
      const evalHints = traceLogs
        .map((t: any) => `- Caution on harness '${t.harness}': ${t.payload?.reason || 'Restricted'}`)
        .join('\n');
      const evalContent = `Known Execution Boundaries:\n${evalHints}`;
      return {
        id: 'telemetry_eval_hints',
        type: 'telemetry_eval',
        priority: 80,
        content: evalContent,
        estimatedTokens: estimateTokens(evalContent),
      };
    }
  } catch (err) {
    // Non-blocking fallback if audit query misses
  }
  return null;
}

async function buildWorkspaceMemoryNode(workspaceId: string, taskPrompt: string): Promise<{ node: ContextNode | null; memoryNodeIds: string[] }> {
  const memoryNodeIds: string[] = [];
  try {
    if (!supabaseAdmin) return { node: null, memoryNodeIds };

    const embeddingResult = await generateEmbeddingWithMetadata(taskPrompt);
    const rpcName = 'match_workspace_memories_v2';
    const { data: memoryRows, error: memoryError } = await supabaseAdmin.rpc(rpcName, {
      query_embedding: embeddingResult.vector,
      target_workspace_id: workspaceId,
      match_threshold: 0.35,
      match_count: 5,
    });

    if (memoryError) throw memoryError;
    const rows = (memoryRows ?? []) as any[];
    if (rows.length === 0) return { node: null, memoryNodeIds };

    const memoryContent = `Workspace Context:\n${rows.map((m, idx) => `[${idx + 1}] ${m.content}`).join('\n')}`;
    memoryNodeIds.push(...rows.map(m => m.id));
    return {
      node: {
        id: 'workspace_memory',
        type: 'workspace_memory',
        priority: 60,
        content: memoryContent,
        estimatedTokens: estimateTokens(memoryContent),
      },
      memoryNodeIds,
    };
  } catch (err) {
    // Non-blocking fallback
  }
  return { node: null, memoryNodeIds };
}

export async function assembleDynamicContext(options: AssembleContextOptions): Promise<{ context: string; memoryNodeIds: string[] }> {
  const { orgContext, workspaceId, taskPrompt, tokenBudget = 3000 } = options;
  const nodes: ContextNode[] = [];

  triggerNonBlockingEviction();

  nodes.push(buildTrustBoundaryNode(orgContext));

  const telemetryNode = buildTelemetryEvalNode(orgContext);
  if (telemetryNode) nodes.push(telemetryNode);

  const { node: memoryNode, memoryNodeIds } = await buildWorkspaceMemoryNode(workspaceId, taskPrompt);
  if (memoryNode) nodes.push(memoryNode);

  nodes.sort((a, b) => b.priority - a.priority);

  let currentTokens = 0;
  const packedContents: string[] = [];

  for (const node of nodes) {
    if (currentTokens + node.estimatedTokens <= tokenBudget) {
      packedContents.push(node.content);
      currentTokens += node.estimatedTokens;
    }
  }

  if (taskPrompt) {
    const promptTokens = estimateTokens(taskPrompt);
    if (currentTokens + promptTokens <= tokenBudget) {
      packedContents.push(taskPrompt);
    }
  }

  return { context: packedContents.join('\n\n'), memoryNodeIds };
}
