"use strict";
/**
 * RAG Memory Middleware - Utility to fetch and inject user memories into API requests
 * Used by Next.js API routes to provide context to Gemini
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRAGMemoryContext = getRAGMemoryContext;
exports.getWorkspaceMemoryContext = getWorkspaceMemoryContext;
exports.captureMemory = captureMemory;
exports.getGitHubContext = getGitHubContext;
exports.extractTags = extractTags;
exports.generateSummary = generateSummary;
exports.estimateTokenCount = estimateTokenCount;
exports.gatherUserContext = gatherUserContext;
exports.getMemoryStatistics = getMemoryStatistics;
exports.formatUserContextForPrompt = formatUserContextForPrompt;
exports.getHighConfidenceFacts = getHighConfidenceFacts;
exports.formatFactsForPrompt = formatFactsForPrompt;
exports.getHighConfidenceFactsDirectly = getHighConfidenceFactsDirectly;
const intelligentMemory_1 = require("@/lib/intelligentMemory");
const vectorStore_1 = require("@/lib/memory/vectorStore");
const supabaseClient_1 = require("@/lib/supabaseClient");
/**
 * Fetch relevant memories from Cloud Function and format for prompt injection
 */
async function getRAGMemoryContext(userId, query, featureType) {
    try {
        // Replaced Cloud Function with Supabase Vector Search
        const memories = await (0, vectorStore_1.searchMemories)(userId, query, 10, featureType); // Fetch more to filter
        if (memories.length === 0) {
            return { contextString: '', sources: [] };
        }
        // Create vector similarities map
        const similarities = new Map();
        memories.forEach((m) => {
            similarities.set(m.id, m.similarity || 0);
        });
        // Map to ExtractedFact format
        const facts = memories.map((m) => ({
            id: m.id,
            content: m.content, // Use full content or summary? summary is usually what we want for context
            type: m.type,
            confidence: 0.8,
            extractedAt: new Date(m.createdAt),
            metadata: m.metadata
        }));
        const ranked = (0, intelligentMemory_1.rankMemoriesIntelligently)(facts, similarities, query);
        const rankedMemories = ranked.slice(0, 5);
        // Format memories for prompt injection
        const contextString = formatMemoriesForPrompt(rankedMemories);
        // Extract sources
        const sources = rankedMemories.map((m) => ({
            id: m.id,
            title: m.metadata?.title || m.content.substring(0, 50) + '...',
            type: m.type || 'memory',
            similarity: m.contextRelevance,
            content: m.content
        }));
        return { contextString, sources };
    }
    catch (error) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        const isRateLimit = error?.status === 429 || errorMessage.includes('429');
        if (isRateLimit) {
            console.warn(`[RAG] Rate limited for user ${userId}, query: "${query.substring(0, 50)}..."`);
        }
        else {
            console.error("[RAG] Error retrieving context for user %s:", userId, {
                query: query.substring(0, 100),
                featureType,
                error: errorMessage
            });
        }
        return { contextString: '', sources: [] }; // Fail gracefully - don't block main request
    }
}
async function getWorkspaceMemoryContext(userId, workspaceId, query, limit = 10) {
    try {
        const { safeDecompress } = await Promise.resolve().then(() => __importStar(require('@/lib/compression')));
        const { data, error } = await supabaseClient_1.supabase
            .from('memory_bank')
            .select('id, content, type, metadata, updated_at')
            .eq('user_id', userId)
            .eq('scope', 'workspace')
            .contains('metadata', { workspaceId })
            .order('updated_at', { ascending: false })
            .limit(limit);
        if (error)
            throw error;
        if (!data || data.length === 0)
            return { contextString: '', sources: [] };
        const facts = data.map((m) => ({
            id: m.id,
            content: safeDecompress(m.content),
            type: m.type,
            confidence: 0.85,
            extractedAt: new Date(m.updated_at),
            metadata: m.metadata,
        }));
        const similarities = new Map();
        const queryWords = query.toLowerCase().split(/\s+/);
        for (const fact of facts) {
            const factWords = (fact.content ?? '').toLowerCase().split(/\s+/);
            const overlap = factWords.filter((w) => queryWords.includes(w)).length;
            similarities.set(fact.id || '', overlap / Math.max(factWords.length, queryWords.length, 1));
        }
        const ranked = (0, intelligentMemory_1.rankMemoriesIntelligently)(facts, similarities, query).slice(0, 5);
        const contextString = formatMemoriesForPrompt(ranked);
        const sources = ranked.map((m) => ({
            id: m.id,
            title: m.metadata?.title || m.content.substring(0, 50) + '...',
            type: m.type || 'workspace_memory',
            similarity: m.contextRelevance,
            content: m.content
        }));
        return { contextString, sources };
    }
    catch (error) {
        console.error('Error retrieving workspace memory context:', error);
        return { contextString: '', sources: [] };
    }
}
/**
 * Format retrieved memories into context string for Gemini
 */
function formatMemoriesForPrompt(memories) {
    if (memories.length === 0) {
        return '';
    }
    const memoryContext = memories
        .map((memory) => `
**Previous Interaction** (${memory.featureType}):
Title: ${memory.title}
Summary: ${memory.summary}
Tags: ${memory.tags?.join(', ') || 'N/A'}
`)
        .join('\n');
    return `
## User's Relevant Previous Work
Below are similar interactions this user has done before. Use this context to provide more relevant and personalized responses:

${memoryContext}

---
`;
}
/**
 * Send memory capture request to Cloud Function
 */
async function captureMemory(userId, featureType, title, summary, messages, tokensUsed, tags, metadata) {
    try {
        const workspaceId = typeof metadata?.workspaceId === 'string' ? metadata.workspaceId : null;
        const scope = workspaceId ? 'workspace' : 'conversation';
        // Replaced Cloud Function with Supabase Store
        const memoryId = await (0, vectorStore_1.storeMemory)(userId, summary, 'conversation_summary', {
            title,
            featureType,
            tags,
            ...metadata,
            tokensUsed
        }, {
            scope,
            workspaceId,
        });
        if (memoryId) {
            return { success: true, memoryId };
        }
        else {
            return { success: false, error: "Failed to store memory" };
        }
    }
    catch (error) {
        if (error?.status === 429 || error?.toString().includes("429")) {
            console.warn('Memory Capture Rate Limited (429). Skipping capture.');
            return { success: false, error: 'Rate limit' };
        }
        console.error('Error capturing memory:', error);
        // Don't throw - memory capture failure shouldn't block API response
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
/**
 * Retrieve GitHub context for a specific repo
 */
async function getGitHubContext(userId, query, repo) {
    try {
        // Search specifically for GitHub code chunks
        const memories = await (0, vectorStore_1.searchMemories)(userId, query, 15, 'github');
        // Filter by repo if multiple are indexed (though usually we index one at a time for context)
        const repoMemories = memories.filter((m) => m.metadata?.repo === repo);
        if (repoMemories.length === 0)
            return '';
        // Create vector similarities map
        const similarities = new Map();
        repoMemories.forEach((m) => {
            similarities.set(m.id, m.similarity || 0);
        });
        // Map to ExtractedFact format for ranking
        const facts = repoMemories.map((m) => ({
            id: m.id,
            content: m.content,
            type: 'code',
            confidence: 1.0, // Assumed high for code
            extractedAt: new Date(m.createdAt),
            metadata: m.metadata
        }));
        // Rank intelligently
        // We pass 'query' as context for keyword overlap check
        const ranked = (0, intelligentMemory_1.rankMemoriesIntelligently)(facts, similarities, query);
        const topChunks = ranked.slice(0, 5);
        return `
## GitHub Repository Context (${repo})
The following code snippets from the user's repository are relevant to the query:

${topChunks.map((chunk) => `
**File: ${chunk.metadata?.filePath || 'unknown'}** (Relevance: ${Math.round((chunk.contextRelevance || 0) * 100)}%)
\`\`\`${chunk.metadata?.language || ''}
${chunk.content.substring(0, 1500)}
\`\`\`
`).join('\n')}

---
`;
    }
    catch (error) {
        console.error('Error retrieving GitHub context:', error);
        return '';
    }
}
/**
 * Extract keywords/topics from text for tagging
 */
function extractTags(text, maxTags = 5) {
    // Simple keyword extraction - in production, use ML-based NLP
    const stopWords = new Set([
        'the',
        'a',
        'an',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'can',
        'this',
        'that',
        'these',
        'those',
        'i',
        'you',
        'he',
        'she',
        'it',
        'we',
        'they',
        'what',
        'which',
        'who',
        'when',
        'where',
        'why',
        'how',
    ]);
    const words = text
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 3 && !stopWords.has(word));
    // Get word frequencies
    const frequency = {};
    words.forEach((word) => {
        frequency[word] = (frequency[word] || 0) + 1;
    });
    // Sort by frequency and return top tags
    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTags)
        .map(([word]) => word);
}
/**
 * Generate summary from conversation
 */
function generateSummary(messages, maxLength = 300) {
    // Extract the last assistant message as summary
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
            let summary = messages[i].content;
            if (summary.length > maxLength) {
                summary = summary.substring(0, maxLength) + '...';
            }
            return summary;
        }
    }
    return 'Interaction completed';
}
/**
 * Calculate approximate token count (rough estimation)
 * In production, use tokenizer library
 */
function estimateTokenCount(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
}
/**
 * Gather comprehensive user context from Clerk user data and memory statistics
 * This enriches the conversation with user profile information
 */
async function gatherUserContext(userId, clerkUser) {
    try {
        // Get user statistics from memory
        const stats = await getMemoryStatistics(userId);
        // Build user context
        const userContext = {
            userId,
            email: clerkUser?.primaryEmailAddress?.emailAddress,
            firstName: clerkUser?.firstName,
            lastName: clerkUser?.lastName,
            fullName: clerkUser?.fullName,
            profileImageUrl: clerkUser?.imageUrl,
            clerkMetadata: clerkUser?.unsafeMetadata,
            conversationCount: stats.totalMemories,
            totalTokensUsed: stats.totalTokensUsed,
            lastConversationDate: stats.lastInteractionDate,
            preferredFeatures: stats.topFeatures,
            commonTopics: stats.topTags,
            interactionStyle: identifyInteractionStyle(stats),
        };
        return userContext;
    }
    catch (error) {
        if (error?.status === 429 || error?.toString().includes("429")) {
            console.warn('User Context Rate Limited (429). Returning minimal context.');
        }
        else {
            console.error('Error gathering user context:', error);
        }
        // Return minimal context on error
        return {
            userId,
            conversationCount: 0,
            totalTokensUsed: 0,
            preferredFeatures: [],
            commonTopics: [],
        };
    }
}
/**
 * Fetch memory statistics for a user via Cloud Function
 */
async function getMemoryStatistics(userId) {
    try {
        const stats = await (0, vectorStore_1.getMemoryStats)(userId);
        return {
            totalMemories: stats.totalMemories,
            totalTokensUsed: 0, // Not yet fully tracked in aggregate
            lastInteractionDate: stats.lastInteractionDate,
            topFeatures: [], // Not yet implemented
            topTags: [], // Not yet implemented
        };
    }
    catch (error) {
        console.error('Error fetching memory statistics:', error);
        return {
            totalMemories: 0,
            totalTokensUsed: 0,
            topFeatures: [],
            topTags: [],
        };
    }
}
/**
 * Identify user interaction style from memory patterns
 */
function identifyInteractionStyle(stats) {
    const features = stats.topFeatures || [];
    const tags = stats.topTags || [];
    const combined = [...features, ...tags].join(' ').toLowerCase();
    if (combined.includes('code') || combined.includes('technical')) {
        return 'technical';
    }
    if (combined.includes('creative') || combined.includes('design')) {
        return 'creative';
    }
    if (combined.includes('business') || combined.includes('analysis')) {
        return 'analytical';
    }
    return 'general';
}
/**
 * Format user context into a system prompt enhancement
 */
function formatUserContextForPrompt(userContext) {
    const lines = [];
    if (userContext.fullName) {
        lines.push(`User: ${userContext.fullName}`);
    }
    if (userContext.conversationCount > 0) {
        lines.push(`Conversation History: ${userContext.conversationCount} previous interactions`);
        if (userContext.lastConversationDate) {
            const lastDate = new Date(userContext.lastConversationDate);
            const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince === 0) {
                lines.push('Last conversation: Today');
            }
            else if (daysSince === 1) {
                lines.push('Last conversation: Yesterday');
            }
            else {
                lines.push(`Last conversation: ${daysSince} days ago`);
            }
        }
    }
    if (userContext.preferredFeatures.length > 0) {
        lines.push(`Favorite Features: ${userContext.preferredFeatures.slice(0, 3).join(', ')}`);
    }
    if (userContext.commonTopics.length > 0) {
        lines.push(`Common Topics: ${userContext.commonTopics.slice(0, 4).join(', ')}`);
    }
    if (userContext.interactionStyle) {
        lines.push(`Interaction Style: ${userContext.interactionStyle}`);
    }
    if (lines.length === 0) {
        return '';
    }
    return `\n## About This User\n${lines.join('\n')}\n`;
}
/**
 * Retrieve high-confidence facts for a user
 * Facts are extracted from conversations and stored for hallucination prevention
 */
async function getHighConfidenceFacts(userId, limit = 10) {
    try {
        // Direct retrieval (Cloud Function deprecated)
        return await getHighConfidenceFactsDirectly(userId, limit);
    }
    catch (error) {
        console.error('Error retrieving facts:', error);
        return [];
    }
}
/**
 * Format extracted facts into context string for prompt injection
 */
function formatFactsForPrompt(facts) {
    if (!facts || facts.length === 0) {
        return '';
    }
    const grouped = new Map();
    facts.forEach((fact) => {
        if (!grouped.has(fact.type)) {
            grouped.set(fact.type, []);
        }
        grouped.get(fact.type).push(fact);
    });
    let prompt = '\n## Critical Context (Verified Facts)\n';
    // Decisions (highest priority)
    if (grouped.has('decision')) {
        prompt += '\n**Decisions Made:**\n';
        grouped.get('decision').forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Action Items
    if (grouped.has('action_item')) {
        prompt += '\n**Action Items:**\n';
        grouped.get('action_item').forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Blockers
    if (grouped.has('blocker')) {
        prompt += '\n**Current Blockers:**\n';
        grouped.get('blocker').forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Projects
    if (grouped.has('project')) {
        prompt += '\n**Active Projects:**\n';
        grouped.get('project').forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    // Verifications
    if (grouped.has('verification')) {
        prompt += '\n**Verified Information:**\n';
        grouped.get('verification').forEach((f) => {
            prompt += `- ${f.content}\n`;
        });
    }
    prompt += '\nReference the above facts to ensure accuracy in your response.\n';
    return prompt;
}
/**
 * Direct Firestore retrieval of facts (bypasses Cloud Function for reliability)
 * Used when Cloud Function endpoint is unavailable
 */
async function getHighConfidenceFactsDirectly(userId, limit = 10) {
    try {
        // Use centralized initialization to ensure credentials are loaded
        const { db } = await Promise.resolve().then(() => __importStar(require('@/lib/firebaseAdmin')));
        const now = Date.now();
        // Query facts collection for user
        const factsRef = db.collection('users').doc(userId).collection('facts');
        // Get facts ordered by confidence and recency
        const snapshot = await factsRef
            .orderBy('confidence', 'desc')
            .orderBy('extractedAt', 'desc')
            .limit(limit * 2)
            .get();
        const facts = [];
        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Skip soft-deleted facts
            if (data.isDeleted === true) {
                return;
            }
            // Skip expired conversation facts
            if (data.expiresAt && data.expiresAt < now) {
                return;
            }
            // Only include high-confidence facts (0.75+)
            if (data.confidence >= 0.75) {
                facts.push({
                    id: doc.id,
                    type: data.type,
                    content: data.content,
                    confidence: data.confidence,
                    scope: data.scope,
                    extractedAt: data.extractedAt,
                    expiresAt: data.expiresAt,
                });
            }
        });
        return facts.slice(0, limit);
    }
    catch (error) {
        console.error('Error retrieving facts directly from Firestore:', error);
        return [];
    }
}
