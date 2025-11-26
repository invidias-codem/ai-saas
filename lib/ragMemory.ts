/**
 * RAG Memory Middleware - Utility to fetch and inject user memories into API requests
 * Used by Next.js API routes to provide context to Gemini
 */

import axios from 'axios';
import { Message } from './schemas';

/**
 * Fetch relevant memories from Cloud Function and format for prompt injection
 */
export async function getRAGMemoryContext(
  userId: string,
  query: string,
  featureType?: string
): Promise<string> {
  try {
    if (!process.env.NEXT_PUBLIC_RAG_ENABLED || !process.env.RAG_CLOUD_FUNCTION_URL) {
      return '';
    }

    const response = await axios.post(
      `${process.env.RAG_CLOUD_FUNCTION_URL}/retrieveMemories`,
      {
        userId,
        query,
        featureType,
        limit: parseInt(process.env.RAG_RETRIEVAL_LIMIT || '5'),
      },
      {
        timeout: 5000, // 5 second timeout for RAG retrieval
      }
    );

    if (!response.data.memories || response.data.memories.length === 0) {
      return '';
    }

    // Format memories for prompt injection
    return formatMemoriesForPrompt(response.data.memories);
  } catch (error) {
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
    if (!process.env.RAG_CLOUD_FUNCTION_URL) {
      console.warn('RAG_CLOUD_FUNCTION_URL not configured - skipping memory capture');
      return { success: false, error: 'RAG not configured' };
    }

    const response = await axios.post(
      `${process.env.RAG_CLOUD_FUNCTION_URL}/captureConversationMemory`,
      {
        userId,
        featureType,
        title,
        summary,
        messages,
        tokensUsed,
        tags,
        metadata,
      },
      {
        timeout: 10000, // 10 second timeout
      }
    );

    return {
      success: response.data.success,
      memoryId: response.data.memoryId,
    };
  } catch (error) {
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
  } catch (error) {
    console.error('Error gathering user context:', error);
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
    if (!process.env.RAG_CLOUD_FUNCTION_URL) {
      return {
        totalMemories: 0,
        totalTokensUsed: 0,
        topFeatures: [],
        topTags: [],
      };
    }

    const response = await axios.post(
      `${process.env.RAG_CLOUD_FUNCTION_URL}/getMemoryStats`,
      { userId },
      { timeout: 5000 }
    );

    if (response.data.success) {
      return {
        totalMemories: response.data.totalMemories || 0,
        totalTokensUsed: response.data.totalTokensUsed || 0,
        lastInteractionDate: response.data.lastInteractionDate
          ? new Date(response.data.lastInteractionDate)
          : undefined,
        topFeatures: response.data.topFeatures || [],
        topTags: response.data.topTags || [],
      };
    }

    return {
      totalMemories: 0,
      totalTokensUsed: 0,
      topFeatures: [],
      topTags: [],
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
