"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPreparedContextPlanFromMemoryPlan = createPreparedContextPlanFromMemoryPlan;
exports.prepareContextBundle = prepareContextBundle;
exports.layoutPromptContext = layoutPromptContext;
const ragMemory_1 = require("@/lib/ragMemory");
const intelligentMemory_1 = require("@/lib/intelligentMemory");
const graphStore_1 = require("@/lib/memory/graphStore");
const researcher_1 = require("@/lib/agents/researcher");
const memoryPromotion_1 = require("@/lib/memoryPromotion");
const embedding_1 = require("@/lib/memory/embedding");
const confidenceScoring_1 = require("@/lib/memory/confidenceScoring");
function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
}
function createPromptSection(key, label, text, priority, required = false) {
    return {
        key,
        label,
        text,
        estimatedTokens: estimateTokens(text),
        priority,
        ...(required ? { required: true } : {}),
    };
}
function normalizePreparedContextPlan(plan) {
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
function createPreparedContextPlanFromMemoryPlan(memoryPlan) {
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
function buildReadEnforcement(plan, options) {
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
async function computeFactSimilarities(allFacts, userQuery) {
    const similarities = new Map();
    if (!allFacts.length)
        return similarities;
    let queryEmbedding = null;
    try {
        queryEmbedding = await (0, embedding_1.generateEmbedding)(userQuery);
    }
    catch (e) {
        console.warn('[PreparedContext] Query embedding failed, falling back to keyword matching:', e.message);
    }
    if (queryEmbedding && queryEmbedding.some(v => v !== 0)) {
        for (const fact of allFacts) {
            try {
                const factEmbedding = await (0, embedding_1.generateEmbedding)(fact.content ?? '');
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
            }
            catch {
                similarities.set(fact.id || '', 0);
            }
        }
        return similarities;
    }
    const queryWords = userQuery.toLowerCase().split(/\s+/);
    for (const fact of allFacts) {
        const factWords = (fact.content ?? '').toLowerCase().split(/\s+/);
        const overlap = factWords.filter((w) => queryWords.includes(w)).length;
        const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
        similarities.set(fact.id || '', Math.min(1, similarity * 1.5));
    }
    return similarities;
}
async function prepareContextBundle(args) {
    const { userId, clerkUser, userQuery, workspaceId, agentMode, options } = args;
    const userContext = await (0, ragMemory_1.gatherUserContext)(userId, clerkUser);
    const userContextPrompt = (0, ragMemory_1.formatUserContextForPrompt)(userContext);
    const normalizedPlan = normalizePreparedContextPlan(options?.plan);
    const readEnforcement = buildReadEnforcement(normalizedPlan, options);
    const effectivelyDisabled = Boolean(options?.disableExternalContext) || normalizedPlan.usePreparedContext === false;
    const allowGraphRecall = readEnforcement.graphReadAllowed;
    const allowUserProfile = readEnforcement.userProfileReadAllowed;
    const allowMemory = readEnforcement.conversationMemoryReadAllowed || readEnforcement.workspaceMemoryReadAllowed || readEnforcement.userProfileReadAllowed;
    const allowResearch = readEnforcement.researchReadAllowed;
    let allFacts = [];
    let researchResults = [];
    let graphData = { centralNode: null, relatedNodes: [] };
    let userProfileMemories = null;
    let memoryContext = '';
    let workspaceMemoryContext = '';
    let memorySources = [];
    if (!effectivelyDisabled) {
        const results = await Promise.allSettled([
            readEnforcement.factsReadAllowed ? (0, ragMemory_1.getHighConfidenceFacts)(userId) : Promise.resolve([]),
            allowResearch ? (0, researcher_1.performResearch)(userQuery, userContextPrompt) : Promise.resolve({ results: [] }),
            allowGraphRecall ? (0, graphStore_1.findRelatedEntities)(userId, userQuery) : Promise.resolve({ centralNode: null, relatedNodes: [] }),
            allowUserProfile ? (0, memoryPromotion_1.getUserProfile)(userId) : Promise.resolve(null),
            readEnforcement.conversationMemoryReadAllowed ? (0, ragMemory_1.getRAGMemoryContext)(userId, userQuery, 'conversation') : Promise.resolve({ contextString: '', sources: [] }),
            readEnforcement.workspaceMemoryReadAllowed && workspaceId ? (0, ragMemory_1.getWorkspaceMemoryContext)(userId, workspaceId, userQuery) : Promise.resolve({ contextString: '', sources: [] }),
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
    const similarities = effectivelyDisabled ? new Map() : await computeFactSimilarities(allFacts, userQuery);
    const rankedFacts = effectivelyDisabled ? [] : (0, intelligentMemory_1.rankMemoriesIntelligently)(allFacts, similarities, userQuery);
    const intelligentFacts = rankedFacts.slice(0, normalizedPlan.factLimit);
    let factContext = '';
    if (!effectivelyDisabled) {
        if (agentMode === 'reasoning' || normalizedPlan.retrievalMode === 'deep') {
            factContext = await (0, intelligentMemory_1.synthesizeContextWithReasoning)(intelligentFacts, userQuery);
            if (factContext) {
                factContext = `\n## Synthesized Context\n${factContext}\n`;
            }
        }
        else {
            factContext = (0, ragMemory_1.formatFactsForPrompt)(intelligentFacts);
        }
    }
    const userProfileContext = effectivelyDisabled || !allowUserProfile ? '' : (0, memoryPromotion_1.formatUserProfileForPrompt)(userProfileMemories);
    const graphContext = effectivelyDisabled || !allowGraphRecall ? '' : (0, graphStore_1.formatGraphContext)(graphData);
    const searchContext = effectivelyDisabled || !allowResearch ? '' : (0, researcher_1.formatSearchResults)(researchResults);
    const confidenceSignal = agentMode === 'fast' && !effectivelyDisabled && intelligentFacts.length > 0
        ? (0, confidenceScoring_1.scoreContextForRouting)(intelligentFacts.slice(0, 5), 'minimum')
        : null;
    return {
        userContext,
        sections: {
            userContextPrompt,
            userProfileContext,
            factContext,
            graphContext,
            searchContext,
            memoryContext: [memoryContext, workspaceMemoryContext].filter(Boolean).join('\n\n'),
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
function layoutPromptContext(systemInstruction, sections, budgetTokens = 6000) {
    const candidates = [
        createPromptSection('userContextPrompt', 'User Context', sections.userContextPrompt, 100, true),
        createPromptSection('userProfileContext', 'User Profile', sections.userProfileContext, 90),
        createPromptSection('factContext', 'Fact Context', sections.factContext, 95),
        createPromptSection('graphContext', 'Graph Context', sections.graphContext, 80),
        createPromptSection('searchContext', 'Search Context', sections.searchContext, 60),
        createPromptSection('memoryContext', 'Memory Context', sections.memoryContext, 85),
    ].filter((section) => section.text && section.text.trim().length > 0);
    const includedSections = [];
    const omittedSections = [];
    let usedTokens = estimateTokens(systemInstruction);
    for (const section of candidates.sort((a, b) => b.priority - a.priority)) {
        const nextUsed = usedTokens + section.estimatedTokens;
        if (section.required || nextUsed <= budgetTokens) {
            includedSections.push(section);
            usedTokens = nextUsed;
        }
        else {
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
