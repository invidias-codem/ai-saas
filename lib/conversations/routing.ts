// lib/conversations/routing.ts
// Pure decision logic for conversation routing — extracted from route
// handlers so the invariants are unit-testable without Next.js runtime.

export interface ConversationRoutingDecision {
  forceNew: boolean;
  targetWorkspaceId: string;
}

/** Blank-slate rule: ?action=new forces a fresh conversation. */
export function decideForceNew(searchParams: Record<string, string | string[] | undefined> | null | undefined): boolean {
  return searchParams?.action === 'new';
}

/**
 * Workspace resolution for /conversation/new:
 * prefer an explicitly requested workspace (owned), else the default.
 * Returns null when neither is available — callers redirect to onboarding.
 */
export function resolveWorkspaceForNewConversation(params: {
  requestedWorkspaceId?: string | null;
  requestedWorkspaceOwned?: { id: string; default_operating_profile_id: string | null } | null;
  defaultWorkspace?: { id: string; default_operating_profile_id: string | null } | null;
}): { id: string; default_operating_profile_id: string | null } | null {
  const { requestedWorkspaceId, requestedWorkspaceOwned, defaultWorkspace } = params;
  if (requestedWorkspaceId && requestedWorkspaceOwned) return requestedWorkspaceOwned;
  if (defaultWorkspace) return defaultWorkspace;
  return null;
}

/**
 * IDOR wall: the conversation fetch MUST be scoped by both the conversation
 * id and the authenticated user id. Returned as the filter pair the caller
 * is obliged to apply — a missing userId means the query must not run.
 */
export function conversationAccessFilter(conversationId: string, userId: string | null): { id: string; user_id: string } | null {
  if (!userId) return null;
  return { id: conversationId, user_id: userId };
}
