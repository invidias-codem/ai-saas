type UserResource = any;
import type { AgentMode } from '@/lib/llm/types';
import type { UcolMemoryPlan, UcolMemoryScope, UcolRetrievalMode } from '@/lib/ucol/routing/types';
import type { ExtractedFact } from '@/lib/intelligentMemory';
import type { SearchResult } from '@/lib/integrations/anyCrawl';
import type { GraphNode } from '@/lib/memory/graphStore';
import type { PromotableMemory } from '@/lib/memoryPromotion';
import type { Source } from '@/lib/ragMemory';
import {
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt,
  getRAGMemoryContext,
  getWorkspaceMemoryContext,
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently, synthesizeContextWithReasoning } from '@/lib/intelligentMemory';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { generateEmbedding } from '@/lib/memory/embedding';
import { scoreContextForRouting } from '@/lib/memory/confidenceScoring';
import { getAttachedDocumentContext } from '@/lib/llm/contextAggregator';
// Slice 6A: one canonical PreparedContextSections. types.ts owns the
// canonical shape; preparedContext re-exports so existing import paths
// keep working. Closes the strategyContext drift at the boundary we are
// about to formalize.
export type { PreparedContextSections } from '@/lib/context/types';
import type { PreparedContextSections } from '@/lib/context/types';

// Phase 0 (#440 review finding 2): the plan/enforcement layer moved to
// lib/context/readEnforcement.ts so the capability manifest derives from the
// SAME effective read enforcement retrieval uses. Re-exported here to keep
// existing import paths working (PreparedContextSections precedent).
export {
  createPreparedContextPlanFromMemoryPlan,
  normalizePreparedContextPlan,
  buildReadEnforcement,
} from '@/lib/context/readEnforcement';
export type {
  PreparedContextPlan,
  PreparedContextOptions,
  PreparedContextReadEnforcement,
} from '@/lib/context/readEnforcement';
import { normalizePreparedContextPlan, buildReadEnforcement } from '@/lib/context/readEnforcement';
import type {
  PreparedContextPlan,
  PreparedContextOptions,
  PreparedContextReadEnforcement,
} from '@/lib/context/readEnforcement';

export type PreparedContextBundle = {
  userContext: Awaited<ReturnType<typeof gatherUserContext>>;
  sections: PreparedContextSections;
  raw: {
    allFacts: ExtractedFact[];
    intelligentFacts: ExtractedFact[];
    researchResults: SearchResult[];
    graphData: { centralNode: GraphNode | null; relatedNodes: any[] };
    userProfileMemories: PromotableMemory[] | null;
    memorySources: Source[];
  };
  metrics: {
    factsCount: number;
    researchResultsCount: number;
    memorySourcesCount: number;
    graphRelatedCount: number;
  };
  routing: {
    confidenceSignal: ReturnType<typeof scoreContextForRouting> | null;
    appliedPlan: PreparedContextPlan;
    readEnforcement: PreparedContextReadEnforcement;
  };
};

export type PromptSection = {
  key: keyof PreparedContextSections;
  label: string;
  text: string;
  estimatedTokens: number;
  priority: number;
  required?: boolean;
};

export type PromptLayoutResult = {
  packedContext: string;
  includedSections: PromptSection[];
  omittedSections: PromptSection[];
  estimatedTokens: number;
  budgetTokens: number;
};

function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

function createPromptSection(
  key: keyof PreparedContextSections,
  label: string,
  text: string,
  priority: number,
  required: boolean = false,
): PromptSection {
  return {
    key,
    label,
    text,
    estimatedTokens: estimateTokens(text),
    priority,
    ...(required ? { required: true } : {}),
  };
}

// normalizePreparedContextPlan / createPreparedContextPlanFromMemoryPlan /
// buildReadEnforcement moved to lib/context/readEnforcement.ts (#440 review
// finding 2) — re-exported above.

async function computeFactSimilarities(allFacts: ExtractedFact[], userQuery: string): Promise<Map<string, number>> {
  const similarities = new Map<string, number>();
  if (!allFacts.length) return similarities;

  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(userQuery);
  } catch (e: any) {
    console.warn('[PreparedContext] Query embedding failed, falling back to keyword matching:', e.message);
  }

  if (queryEmbedding && queryEmbedding.some(v => v !== 0)) {
    for (const fact of allFacts) {
      try {
        const factEmbedding = await generateEmbedding(fact.content ?? '');
        if (factEmbedding.some(v => v !== 0)) {
          let dotProduct = 0, normA = 0, normB = 0;
          for (let i = 0; i < queryEmbedding.length; i++) {
            dotProduct += queryEmbedding[i] * (factEmbedding[i] || 0);
            normA += queryEmbedding[i] * queryEmbedding[i];
            normB += (factEmbedding[i] || 0) * (factEmbedding[i] || 0);
          }
          const cosineSim = normA && normB ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
          similarities.set(fact.id || '', Math.max(0, cosineSim));
        }
      } catch {
        similarities.set(fact.id || '', 0);
      }
    }
    return similarities;
  }

  const queryWords = userQuery.toLowerCase().split(/\s+/);
  for (const fact of allFacts) {
    const factWords = (fact.content ?? '').toLowerCase().split(/\s+/);
    const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
    const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
    similarities.set(fact.id || '', Math.min(1, similarity * 1.5));
  }

  return similarities;
}

export async function prepareContextBundle(args: {
  userId: string;
  clerkUser: UserResource | null;
  userQuery: string;
  workspaceId?: string | null;
  documentIds?: string[];
  agentMode: AgentMode;
  options?: PreparedContextOptions;
}): Promise<PreparedContextBundle> {
  const { userId, clerkUser, userQuery, workspaceId, documentIds, agentMode, options } = args;

  const userContext = await gatherUserContext(userId, clerkUser as any);
  const userContextPrompt = formatUserContextForPrompt(userContext);

  const normalizedPlan = normalizePreparedContextPlan(options?.plan);
  const readEnforcement = buildReadEnforcement(normalizedPlan, options);
  const effectivelyDisabled = Boolean(options?.disableExternalContext) || normalizedPlan.usePreparedContext === false;
  const allowGraphRecall = readEnforcement.graphReadAllowed;
  const allowUserProfile = readEnforcement.userProfileReadAllowed;
  const allowMemory = readEnforcement.conversationMemoryReadAllowed || readEnforcement.workspaceMemoryReadAllowed || readEnforcement.userProfileReadAllowed;
  const allowResearch = readEnforcement.researchReadAllowed;

  let allFacts: ExtractedFact[] = [];
  let researchResults: SearchResult[] = [];
  let graphData: { centralNode: GraphNode | null; relatedNodes: any[] } = { centralNode: null, relatedNodes: [] };
  let userProfileMemories: PromotableMemory[] | null = null;
  let memoryContext = '';
  let workspaceMemoryContext = '';
  let memorySources: Source[] = [];

  if (!effectivelyDisabled) {
    const results = await Promise.allSettled([
      readEnforcement.factsReadAllowed ? getHighConfidenceFacts(userId) : Promise.resolve([]),
      allowResearch ? performResearch(userQuery, userContextPrompt) : Promise.resolve({ results: [] }),
      allowGraphRecall ? findRelatedEntities(userId, userQuery) : Promise.resolve({ centralNode: null, relatedNodes: [] }),
      allowUserProfile ? getUserProfile(userId) : Promise.resolve(null),
      readEnforcement.conversationMemoryReadAllowed ? getRAGMemoryContext(userId, userQuery, 'conversation') : Promise.resolve({ contextString: '', sources: [] }),
      readEnforcement.workspaceMemoryReadAllowed && workspaceId ? getWorkspaceMemoryContext(userId, workspaceId, userQuery) : Promise.resolve({ contextString: '', sources: [] }),
    ]);

    allFacts = results[0].status === 'fulfilled' ? results[0].value : [];
    researchResults = results[1].status === 'fulfilled' ? results[1].value.results.slice(0, normalizedPlan.researchLimit) : [];
    graphData = results[2].status === 'fulfilled' ? results[2].value : { centralNode: null, relatedNodes: [] };
    userProfileMemories = results[3].status === 'fulfilled' ? results[3].value : null;
    if (results[4].status === 'fulfilled') {
      memoryContext = results[4].value.contextString;
      memorySources = results[4].value.sources.slice(0, normalizedPlan.memoryLimit);
    }
    if (results[5] && results[5].status === 'fulfilled') {
      workspaceMemoryContext = results[5].value.contextString;
      memorySources = [...memorySources, ...results[5].value.sources].slice(0, normalizedPlan.memoryLimit);
    }

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const labels = ['facts', 'research', 'graph', 'userProfile', 'conversationRag', 'workspaceRag'];
        console.warn(`[PreparedContext] Context source "${labels[i]}" failed:`, r.reason?.message || r.reason);
      }
    });
  }

  const similarities = effectivelyDisabled ? new Map<string, number>() : await computeFactSimilarities(allFacts, userQuery);
  const rankedFacts = effectivelyDisabled ? [] : rankMemoriesIntelligently(allFacts, similarities, userQuery);
  const intelligentFacts = rankedFacts.slice(0, normalizedPlan.factLimit);

  let factContext = '';
  if (!effectivelyDisabled) {
    if (agentMode === 'reasoning' || normalizedPlan.retrievalMode === 'deep') {
      factContext = await synthesizeContextWithReasoning(intelligentFacts, userQuery);
      if (factContext) {
        factContext = `\n## Synthesized Context\n${factContext}\n`;
      }
    } else {
      factContext = formatFactsForPrompt(intelligentFacts);
    }
  }

  const userProfileContext = effectivelyDisabled || !allowUserProfile ? '' : formatUserProfileForPrompt(userProfileMemories);
  const graphContext = effectivelyDisabled || !allowGraphRecall ? '' : formatGraphContext(graphData);
  const searchContext = effectivelyDisabled || !allowResearch ? '' : formatSearchResults(researchResults);

  const confidenceSignal = agentMode === 'fast' && !effectivelyDisabled && intelligentFacts.length > 0
    ? scoreContextForRouting(intelligentFacts.slice(0, 5), 'minimum')
    : null;

  let attachedDocumentContext = '';
  if (documentIds && documentIds.length > 0) {
    attachedDocumentContext = await getAttachedDocumentContext(userQuery, workspaceId, documentIds);
  }

  // ── EMSH Strategy Synthesis (non-blocking, cold-start safe) ──────────────
  // Query high-fitness genotypes matching this intent and synthesize a reusable
  // operating strategy. Fenced by a short timeout so a cold/empty genotypes table
  // (or a slow Supabase round-trip) never adds latency to the chat hot path.
  let strategyContext = '';
  if (!effectivelyDisabled) {
    try {
      const { synthesizeStrategy } = await import('@/lib/emSh/recombinationEngine');
      const strategy = await Promise.race([
        synthesizeStrategy({ userQuery, workspaceId }),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 1500)
        ),
      ]);
      if (strategy && strategy.prompt) {
        strategyContext = `${strategy.prompt}\n`;
      }
    } catch (e: any) {
      console.warn('[PreparedContext] Strategy synthesis skipped (non-blocking):', e?.message || e);
    }
  }

  return {
    userContext,
    sections: {
      userContextPrompt,
      userProfileContext,
      factContext,
      graphContext,
      searchContext,
      memoryContext: [memoryContext, workspaceMemoryContext].filter(Boolean).join('\n\n'),
      attachedDocumentContext,
      strategyContext,
    },
    raw: {
      allFacts,
      intelligentFacts,
      researchResults,
      graphData,
      userProfileMemories,
      memorySources,
    },
    metrics: {
      factsCount: intelligentFacts.length,
      researchResultsCount: researchResults.length,
      memorySourcesCount: memorySources.length,
      graphRelatedCount: Array.isArray(graphData.relatedNodes) ? graphData.relatedNodes.length : 0,
    },
    routing: {
      confidenceSignal,
      appliedPlan: normalizedPlan,
      readEnforcement,
    },
  };
}

export function layoutPromptContext(
  systemInstruction: string,
  sections: PreparedContextSections,
  budgetTokens: number = 6000,
): PromptLayoutResult {
  const candidates: PromptSection[] = [
    createPromptSection('userContextPrompt', 'User Context', sections.userContextPrompt || '', 100, true),
    createPromptSection('attachedDocumentContext', 'Attached Documents', sections.attachedDocumentContext || '', 98),
    createPromptSection('strategyContext', 'Operating Strategy', sections.strategyContext || '', 92),
    createPromptSection('factContext', 'Fact Context', sections.factContext || '', 95),
    createPromptSection('userProfileContext', 'User Profile', sections.userProfileContext || '', 90),
    createPromptSection('graphContext', 'Graph Context', sections.graphContext || '', 80),
    createPromptSection('searchContext', 'Search Context', sections.searchContext || '', 60),
    createPromptSection('memoryContext', 'Memory Context', sections.memoryContext || '', 85),
  ].filter((section) => section.text && section.text.trim().length > 0);

  const includedSections: PromptSection[] = [];
  const omittedSections: PromptSection[] = [];
  let usedTokens = estimateTokens(systemInstruction);

  for (const section of candidates.sort((a, b) => b.priority - a.priority)) {
    const nextUsed = usedTokens + section.estimatedTokens;
    if (section.required || nextUsed <= budgetTokens) {
      includedSections.push(section);
      usedTokens = nextUsed;
    } else {
      omittedSections.push(section);
    }
  }

  const packedContext = includedSections
    .map(section => section.text.trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    packedContext,
    includedSections,
    omittedSections,
    estimatedTokens: usedTokens,
    budgetTokens,
  };
}
