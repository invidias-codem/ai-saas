import type { AgentContext } from '@/lib/agents/core/types';

/**
 * Builds the minimal AgentContext required by `runReActLoop` on the Trigger.dev
 * worker. The worker has no Clerk request/session, so the context is assembled
 * purely from the serializable task payload (userId/workspaceId/conversationId)
 * — no live objects, no request-scoped harness.
 */
export async function getAgenticContext(args: {
  userId: string;
  workspaceId: string;
  conversationId?: string;
}): Promise<AgentContext> {
  return {
    userId: args.userId,
    sessionId: args.conversationId ?? `trigger-${args.userId}-${Date.now()}`,
    workspaceId: args.workspaceId,
    userRole: 'user',
    history: [],
    enableTelemetry: true,
    operatorApprovalMode: 'non-interactive',
  };
}