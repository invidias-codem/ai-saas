import type { UserResource } from '@clerk/types';
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
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently, synthesizeContextWithReasoning } from '@/lib/intelligentMemory';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { generateEmbedding } from '@/lib/memory/embedding';
import { scoreContextForRouting } from '@/lib/memory/confidenceScoring';

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

export type PreparedContextSections = {
  userContextPrompt: string;
  userProfileContext: string;
  factContext: string;
  graphContext: string;
  searchContext: string;
  memoryContext: string;
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

function normalizePreparedContextPlan(plan?: PreparedContextPlan): Required<PreparedContextPlan> {
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


function buildReadEnforcement(plan: Required<PreparedContextPlan>, options?: PreparedContextOptions): PreparedContextReadEnforcement {
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
  agentMode: AgentMode;
  options?: PreparedContextOptions;
}): Promise<PreparedContextBundle> {
  const { userId, clerkUser, userQuery, agentMode, options } = args;

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
  let memorySources: Source[] = [];

  if (!effectivelyDisabled) {
    const results = await Promise.allSettled([
      readEnforcement.factsReadAllowed ? getHighConfidenceFacts(userId) : Promise.resolve([]),
      allowResearch ? performResearch(userQuery, userContextPrompt) : Promise.resolve({ results: [] }),
      allowGraphRecall ? findRelatedEntities(userId, userQuery) : Promise.resolve({ centralNode: null, relatedNodes: [] }),
      allowUserProfile ? getUserProfile(userId) : Promise.resolve(null),
      readEnforcement.conversationMemoryReadAllowed ? getRAGMemoryContext(userId, userQuery, 'conversation') : Promise.resolve({ contextString: '', sources: [] }),
    ]);

    allFacts = results[0].status === 'fulfilled' ? results[0].value : [];
    researchResults = results[1].status === 'fulfilled' ? results[1].value.results.slice(0, normalizedPlan.researchLimit) : [];
    graphData = results[2].status === 'fulfilled' ? results[2].value : { centralNode: null, relatedNodes: [] };
    userProfileMemories = results[3].status === 'fulfilled' ? results[3].value : null;
    if (results[4].status === 'fulfilled') {
      memoryContext = results[4].value.contextString;
      memorySources = results[4].value.sources.slice(0, normalizedPlan.memoryLimit);
    }

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const labels = ['facts', 'research', 'graph', 'userProfile', 'rag'];
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

  return {
    userContext,
    sections: {
      userContextPrompt,
      userProfileContext,
      factContext,
      graphContext,
      searchContext,
      memoryContext,
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
    createPromptSection('userContextPrompt', 'User Context', sections.userContextPrompt, 100, true),
    createPromptSection('userProfileContext', 'User Profile', sections.userProfileContext, 90),
    createPromptSection('factContext', 'Fact Context', sections.factContext, 95),
    createPromptSection('graphContext', 'Graph Context', sections.graphContext, 80),
    createPromptSection('searchContext', 'Search Context', sections.searchContext, 60),
    createPromptSection('memoryContext', 'Memory Context', sections.memoryContext, 85),
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
