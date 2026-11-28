// lib/context/readEnforcement.ts
// Phase 0 (#440 review finding 2): the pure prepared-context read-enforcement
// layer, extracted from preparedContext.ts so the capability manifest can
// derive availability from the SAME effective enforcement retrieval uses.
// preparedContext.ts re-exports these to keep existing import paths working
// (the PreparedContextSections precedent). No heavy imports in this module.

import type { AgentMode } from '@/lib/llm/types';
import type { UcolMemoryPlan, UcolMemoryScope, UcolRetrievalMode } from '@/lib/ucol/routing/types';

export type PreparedContextPlan = {
  retrievalMode?: UcolRetrievalMode;
  readScopes?: UcolMemoryScope[];
  useGraphRecall?: boolean;
  usePreparedContext?: boolean;
  useRecentTaskState?: boolean;
  factLimit?: number;
  memoryLimit?: number;
  researchLimit?: number;
};

export type PreparedContextOptions = {
  disableExternalContext?: boolean;
  skipWebResearch?: boolean;
  plan?: PreparedContextPlan;
};

export type PreparedContextReadEnforcement = {
  allowedScopes: UcolMemoryScope[];
  factsReadAllowed: boolean;
  userProfileReadAllowed: boolean;
  graphReadAllowed: boolean;
  conversationMemoryReadAllowed: boolean;
  workspaceMemoryReadAllowed: boolean;
  taskMemoryReadAllowed: boolean;
  researchReadAllowed: boolean;
};

export function normalizePreparedContextPlan(plan?: PreparedContextPlan): Required<PreparedContextPlan> {
  const retrievalMode = plan?.retrievalMode ?? 'standard';

  return {
    retrievalMode,
    readScopes: plan?.readScopes ?? ['conversation', 'user'],
    useGraphRecall: plan?.useGraphRecall ?? (retrievalMode === 'deep' || retrievalMode === 'standard'),
    usePreparedContext: plan?.usePreparedContext ?? true,
    useRecentTaskState: plan?.useRecentTaskState ?? false,
    factLimit: plan?.factLimit ?? (retrievalMode === 'deep' ? 15 : retrievalMode === 'standard' ? 10 : 5),
    memoryLimit: plan?.memoryLimit ?? (retrievalMode === 'deep' ? 8 : retrievalMode === 'standard' ? 5 : 3),
    researchLimit: plan?.researchLimit ?? (retrievalMode === 'deep' ? 5 : retrievalMode === 'standard' ? 3 : 0),
  };
}

export function createPreparedContextPlanFromMemoryPlan(memoryPlan?: UcolMemoryPlan | null): PreparedContextPlan {
  if (!memoryPlan) {
    return {
      retrievalMode: 'standard',
      readScopes: ['conversation', 'user'],
      useGraphRecall: true,
      usePreparedContext: true,
      useRecentTaskState: false,
    };
  }

  return {
    retrievalMode: memoryPlan.retrievalMode,
    readScopes: memoryPlan.readScopes,
    useGraphRecall: memoryPlan.useGraphRecall,
    usePreparedContext: memoryPlan.usePreparedContext,
    useRecentTaskState: memoryPlan.useRecentTaskState,
    factLimit: memoryPlan.retrievalMode === 'deep' ? 15 : memoryPlan.retrievalMode === 'standard' ? 10 : 5,
    memoryLimit: memoryPlan.retrievalMode === 'deep' ? 8 : memoryPlan.retrievalMode === 'standard' ? 5 : 3,
    researchLimit: memoryPlan.retrievalMode === 'deep' ? 5 : memoryPlan.retrievalMode === 'standard' ? 3 : 0,
  };
}

export function buildReadEnforcement(
  plan: Required<PreparedContextPlan>,
  options?: PreparedContextOptions,
): PreparedContextReadEnforcement {
  const allowedScopes = [...plan.readScopes];
  const effectivelyDisabled = Boolean(options?.disableExternalContext) || plan.usePreparedContext === false;

  return {
    allowedScopes,
    factsReadAllowed: !effectivelyDisabled && allowedScopes.some((scope) => scope === 'conversation' || scope === 'workspace' || scope === 'user'),
    userProfileReadAllowed: !effectivelyDisabled && allowedScopes.includes('user'),
    graphReadAllowed: !effectivelyDisabled && plan.useGraphRecall && allowedScopes.includes('graph'),
    conversationMemoryReadAllowed: !effectivelyDisabled && allowedScopes.includes('conversation'),
    workspaceMemoryReadAllowed: !effectivelyDisabled && allowedScopes.includes('workspace'),
    taskMemoryReadAllowed: !effectivelyDisabled && plan.useRecentTaskState && allowedScopes.includes('task'),
    researchReadAllowed: !effectivelyDisabled && !options?.skipWebResearch && plan.researchLimit > 0,
  };
}
