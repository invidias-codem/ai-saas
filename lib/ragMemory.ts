/**
 * RAG Memory Middleware - Utility to fetch and inject user memories into API requests
 * Used by Next.js API routes to provide context to Gemini
 */

import axios from 'axios';
import { Message } from './schemas';
import { searchMemories, storeMemory, getMemoryStats } from '@/lib/memory/vectorStore';

/**
 * Fetch relevant memories from Cloud Function and format for prompt injection
 */
export async function getRAGMemoryContext(
  userId: string,
  query: string,
  featureType?: string
): Promise<string> {
  try {
    // Replaced Cloud Function with Supabase Vector Search
    const memories = await searchMemories(userId, query, 10, featureType); // Fetch more to filter

    if (memories.length === 0) {
      return '';
    }

    // Filter or boost imported memories based on confidence/source
    // Imported memories might be voluminous, so we slightly dampen their score to prioritize recent real interactions
    const rankedMemories = memories.map((m: any) => ({
      ...m,
      score: (m.similarity || 0) * (m.metadata?.source === 'import' ? 0.85 : 1.0)
    }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5); // Take top 5 after re-ranking

    // Format memories for prompt injection
    return formatMemoriesForPrompt(rankedMemories);
  } catch (error: any) {
    if (error?.status === 429 || error?.toString().includes("429")) {
      console.warn('RAG Context Rate Limited (429). Proceeding without memory.');
      return '';
    }
    console.error('Error retrieving RAG memory context:', error);
    return ''; // Fail gracefully - don't block main request
  }

}

/**
 * Format retrieved memories into context string for Gemini
 */
function formatMemoriesForPrompt(memories: any[]): string {
  if (memories.length === 0) {
    return '';
  }

  const memoryContext = memories
    .map(
      (memory) => `
**Previous Interaction** (${memory.featureType}):
Title: ${memory.title}
Summary: ${memory.summary}
Tags: ${memory.tags?.join(', ') || 'N/A'}
`
    )
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
export async function captureMemory(
  userId: string,
  featureType: string,
  title: string,
  summary: string,
  messages: Message[],
  tokensUsed: number,
  tags?: string[],
  metadata?: Record<string, any>
): Promise<{ success: boolean; memoryId?: string; error?: string }> {
  try {
    // Replaced Cloud Function with Supabase Store
    const memoryId = await storeMemory(userId, summary, 'conversation_summary', {
      title,
      featureType,
      tags,
      ...metadata,
      tokensUsed
    });

    if (memoryId) {
      return { success: true, memoryId };
    } else {
      return { success: false, error: "Failed to store memory" };
    }
  } catch (error: any) {
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
 * Extract keywords/topics from text for tagging
 */
export function extractTags(text: string, maxTags: number = 5): string[] {
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
  const frequency: Record<string, number> = {};
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
export function generateSummary(messages: Message[], maxLength: number = 300): string {
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
export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * User context gathered from Clerk and stored memories
 */
export interface UserContextData {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  profileImageUrl?: string;
  clerkMetadata?: Record<string, any>;
  conversationCount: number;
  totalTokensUsed: number;
  lastConversationDate?: Date;
  preferredFeatures: string[];
  commonTopics: string[];
  interactionStyle?: string;
}

/**
 * Gather comprehensive user context from Clerk user data and memory statistics
 * This enriches the conversation with user profile information
 */
export async function gatherUserContext(
  userId: string,
  clerkUser?: any
): Promise<UserContextData> {
  try {
    // Get user statistics from memory
    const stats = await getMemoryStatistics(userId);

    // Build user context
    const userContext: UserContextData = {
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
  } catch (error: any) {
    if (error?.status === 429 || error?.toString().includes("429")) {
      console.warn('User Context Rate Limited (429). Returning minimal context.');
    } else {
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
export async function getMemoryStatistics(userId: string): Promise<{
  totalMemories: number;
  totalTokensUsed: number;
  lastInteractionDate?: Date;
  topFeatures: string[];
  topTags: string[];
}> {
  try {
    const stats = await getMemoryStats(userId);

    return {
      totalMemories: stats.totalMemories,
      totalTokensUsed: 0, // Not yet fully tracked in aggregate
      lastInteractionDate: stats.lastInteractionDate,
      topFeatures: [], // Not yet implemented
      topTags: [], // Not yet implemented
    };

  } catch (error) {
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
function identifyInteractionStyle(stats: {
  topFeatures: string[];
  topTags: string[];
}): string {
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
export function formatUserContextForPrompt(userContext: UserContextData): string {
  const lines: string[] = [];

  if (userContext.fullName) {
    lines.push(`User: ${userContext.fullName}`);
  }

  if (userContext.conversationCount > 0) {
    lines.push(`Conversation History: ${userContext.conversationCount} previous interactions`);

    if (userContext.lastConversationDate) {
      const lastDate = new Date(userContext.lastConversationDate);
      const daysSince = Math.floor(
        (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince === 0) {
        lines.push('Last conversation: Today');
      } else if (daysSince === 1) {
        lines.push('Last conversation: Yesterday');
      } else {
        lines.push(`Last conversation: ${daysSince} days ago`);
      }
    }
  }

  if (userContext.preferredFeatures.length > 0) {
    lines.push(`Favorite Features: ${userContext.preferredFeatures.slice(0, 3).join(', ')}`);
  }

  if (userContext.commonTopics.length > 0) {
    lines.push(
      `Common Topics: ${userContext.commonTopics.slice(0, 4).join(', ')}`
    );
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
export async function getHighConfidenceFacts(
  userId: string,
  limit = 10
): Promise<any[]> {
  try {
    // Direct retrieval (Cloud Function deprecated)
    return await getHighConfidenceFactsDirectly(userId, limit);
  } catch (error) {
    console.error('Error retrieving facts:', error);
    return [];
  }
}

/**
 * Format extracted facts into context string for prompt injection
 */
export function formatFactsForPrompt(facts: any[]): string {
  if (!facts || facts.length === 0) {
    return '';
  }

  const grouped = new Map<string, any[]>();
  facts.forEach((fact) => {
    if (!grouped.has(fact.type)) {
      grouped.set(fact.type, []);
    }
    grouped.get(fact.type)!.push(fact);
  });

  let prompt = '\n## Critical Context (Verified Facts)\n';

  // Decisions (highest priority)
  if (grouped.has('decision')) {
    prompt += '\n**Decisions Made:**\n';
    grouped.get('decision')!.forEach((f) => {
      prompt += `- ${f.content}\n`;
    });
  }

  // Action Items
  if (grouped.has('action_item')) {
    prompt += '\n**Action Items:**\n';
    grouped.get('action_item')!.forEach((f) => {
      prompt += `- ${f.content}\n`;
    });
  }

  // Blockers
  if (grouped.has('blocker')) {
    prompt += '\n**Current Blockers:**\n';
    grouped.get('blocker')!.forEach((f) => {
      prompt += `- ${f.content}\n`;
    });
  }

  // Projects
  if (grouped.has('project')) {
    prompt += '\n**Active Projects:**\n';
    grouped.get('project')!.forEach((f) => {
      prompt += `- ${f.content}\n`;
    });
  }

  // Verifications
  if (grouped.has('verification')) {
    prompt += '\n**Verified Information:**\n';
    grouped.get('verification')!.forEach((f) => {
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
export async function getHighConfidenceFactsDirectly(
  userId: string,
  limit = 10
): Promise<any[]> {
  try {
    // Use centralized initialization to ensure credentials are loaded
    const { db } = await import('@/lib/firebaseAdmin');

    const now = Date.now();

    // Query facts collection for user
    const factsRef = db.collection('users').doc(userId).collection('facts');

    // Get facts ordered by confidence and recency
    const snapshot = await factsRef
      .orderBy('confidence', 'desc')
      .orderBy('extractedAt', 'desc')
      .limit(limit * 2)
      .get();

    const facts: any[] = [];

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
  } catch (error) {
    console.error('Error retrieving facts directly from Firestore:', error);
    return [];
  }
}
