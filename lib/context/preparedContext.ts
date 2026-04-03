import type { UserResource } from '@clerk/types';
import type { AgentMode } from '@/lib/llm/types';
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

export type PreparedContextOptions = {
  disableExternalContext?: boolean;
  skipWebResearch?: boolean;
};

export type PreparedContextSections = {
  userContextPrompt: string;
  userProfileContext: string;
  factContext: string;
  graphContext: string;
  searchContext: string;
  memoryContext: string;
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

  const effectivelyDisabled = Boolean(options?.disableExternalContext);

  let allFacts: ExtractedFact[] = [];
  let researchResults: SearchResult[] = [];
  let graphData: { centralNode: GraphNode | null; relatedNodes: any[] } = { centralNode: null, relatedNodes: [] };
  let userProfileMemories: PromotableMemory[] | null = null;
  let memoryContext = '';
  let memorySources: Source[] = [];

  if (!effectivelyDisabled) {
    const results = await Promise.allSettled([
      getHighConfidenceFacts(userId),
      options?.skipWebResearch ? Promise.resolve({ results: [] }) : performResearch(userQuery, userContextPrompt),
      findRelatedEntities(userId, userQuery),
      getUserProfile(userId),
      getRAGMemoryContext(userId, userQuery, 'conversation')
    ]);

    allFacts = results[0].status === 'fulfilled' ? results[0].value : [];
    researchResults = results[1].status === 'fulfilled' ? results[1].value.results : [];
    graphData = results[2].status === 'fulfilled' ? results[2].value : { centralNode: null, relatedNodes: [] };
    userProfileMemories = results[3].status === 'fulfilled' ? results[3].value : null;
    if (results[4].status === 'fulfilled') {
      memoryContext = results[4].value.contextString;
      memorySources = results[4].value.sources;
    }

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const labels = ['facts', 'research', 'graph', 'userProfile', 'rag'];
        console.warn(`[PreparedContext] Context source "${labels[i]}" failed:`, r.reason?.message || r.reason);
      }
    });
  }

  const similarities = effectivelyDisabled ? new Map<string, number>() : await computeFactSimilarities(allFacts, userQuery);
  const intelligentFacts = effectivelyDisabled ? [] : rankMemoriesIntelligently(allFacts, similarities, userQuery);

  let factContext = '';
  if (!effectivelyDisabled) {
    if (agentMode === 'reasoning') {
      factContext = await synthesizeContextWithReasoning(intelligentFacts.slice(0, 15), userQuery);
      if (factContext) {
        factContext = `\n## Synthesized Context (DeepSeek-R1)\n${factContext}\n`;
      }
    } else {
      factContext = formatFactsForPrompt(intelligentFacts);
    }
  }

  const userProfileContext = effectivelyDisabled ? '' : formatUserProfileForPrompt(userProfileMemories);
  const graphContext = effectivelyDisabled ? '' : formatGraphContext(graphData);
  const searchContext = effectivelyDisabled ? '' : formatSearchResults(researchResults);

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
    },
  };
}

export function layoutPromptContext(
  systemInstruction: string,
  sections: PreparedContextSections,
  budgetTokens: number = 6000,
): PromptLayoutResult {
  const candidates: PromptSection[] = [
    { key: 'userContextPrompt', label: 'User Context', text: sections.userContextPrompt, estimatedTokens: estimateTokens(sections.userContextPrompt), priority: 100, required: true },
    { key: 'userProfileContext', label: 'User Profile', text: sections.userProfileContext, estimatedTokens: estimateTokens(sections.userProfileContext), priority: 90 },
    { key: 'factContext', label: 'Fact Context', text: sections.factContext, estimatedTokens: estimateTokens(sections.factContext), priority: 95 },
    { key: 'graphContext', label: 'Graph Context', text: sections.graphContext, estimatedTokens: estimateTokens(sections.graphContext), priority: 80 },
    { key: 'searchContext', label: 'Search Context', text: sections.searchContext, estimatedTokens: estimateTokens(sections.searchContext), priority: 60 },
    { key: 'memoryContext', label: 'Memory Context', text: sections.memoryContext, estimatedTokens: estimateTokens(sections.memoryContext), priority: 85 },
  ].filter(section => section.text && section.text.trim().length > 0);

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
