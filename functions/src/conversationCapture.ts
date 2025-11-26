/**
 * Conversation Capture - Triggered after successful API responses
 * Stores interactions in Firestore for RAG memory
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { storeUserMemory, formatMemoriesForContext } from './ragMemoryService';
import { updateUserContext } from './userInitializer';
import { triggerZapierWebhook } from './zapierIntegration';
import { sendSlackNotification } from './slackIntegration';
import { UserMemory, InteractionEvent } from './schemas';

/**
 * HTTP Cloud Function - Capture conversation after API call
 * Called from Next.js API routes to store interaction in memory
 */
export const captureConversationMemory = functions.https.onRequest(
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const {
        userId,
        featureType,
        title,
        summary,
        messages,
        tags,
        metadata,
        tokensUsed,
      } = req.body;

      if (!userId || !featureType || !summary) {
        res.status(400).json({
          error: 'Missing required fields: userId, featureType, summary',
        });
        return;
      }

      // Store memory
      const memoryInput: any = {
        userId,
        featureType: featureType as UserMemory['featureType'],
        title: title || summary.substring(0, 50),
        summary,
        messages: messages || [],
        tags: tags || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Include metadata with token count for statistics
      if (metadata !== undefined) {
        memoryInput.metadata = {
          ...metadata,
          tokensUsed: tokensUsed || 0,
        };
      } else {
        memoryInput.metadata = {
          tokensUsed: tokensUsed || 0,
        };
      }

      const memory = await storeUserMemory(userId, memoryInput);

      // Update user context
      await updateUserContext(userId, tokensUsed || 0, featureType, tags);

      // Log interaction event
      await logInteractionEvent(userId, featureType, {
        inputLength: messages?.[0]?.content?.length || 0,
        outputLength: summary.length,
        tokensUsed: tokensUsed || 0,
        success: true,
      });

      // Trigger integrations
      await triggerMemoryIntegrations(userId, memory);

      res.status(200).json({
        success: true,
        memoryId: memory.id,
        message: 'Memory captured successfully',
      });
    } catch (error) {
      console.error('Error capturing conversation memory:', error);
      res.status(500).json({
        error: `Failed to capture memory: ${error}`,
      });
    }
  }
);

/**
 * Capture and process memory update
 */
export async function handleMemoryUpdate(
  userId: string,
  memoryId: string,
  updates: Partial<UserMemory>
): Promise<void> {
  try {
    const db = admin.firestore();

    // Update memory document
    await db
      .collection('users')
      .doc(userId)
      .collection('memories')
      .doc(memoryId)
      .update({
        ...updates,
        updatedAt: Date.now(),
      });

    console.log(`Memory ${memoryId} updated for user ${userId}`);
  } catch (error) {
    console.error('Error updating memory:', error);
    throw error;
  }
}

/**
 * Log interaction event for analytics
 */
async function logInteractionEvent(
  userId: string,
  featureType: string,
  data: {
    inputLength: number;
    outputLength: number;
    tokensUsed: number;
    success: boolean;
    error?: string;
    integrationsTriggered?: string[];
  }
): Promise<void> {
  try {
    const db = admin.firestore();

    const event: InteractionEvent = {
      id: `event-${Date.now()}`,
      userId,
      featureType: featureType as InteractionEvent['featureType'],
      action: 'create',
      inputLength: data.inputLength,
      outputLength: data.outputLength,
      tokensUsed: data.tokensUsed,
      duration: 0, // Should be calculated from request
      success: data.success,
      error: data.error,
      integrationsTriggered: data.integrationsTriggered,
      createdAt: Date.now(),
    };

    await db
      .collection('users')
      .doc(userId)
      .collection('interactions')
      .doc(event.id)
      .set(event);
  } catch (error) {
    console.error('Error logging interaction event:', error);
    // Don't throw - analytics failure shouldn't block operations
  }
}

/**
 * Trigger integration webhooks when memory is created
 */
async function triggerMemoryIntegrations(
  userId: string,
  memory: UserMemory
): Promise<void> {
  try {
    const eventData = {
      memoryId: memory.id,
      featureType: memory.featureType,
      title: memory.title,
      summary: memory.summary,
      tags: memory.tags,
      timestamp: memory.createdAt,
    };

    // Trigger Zapier
    await triggerZapierWebhook(userId, 'memory.created', eventData);

    // Send Slack notification
    await sendSlackNotification(
      userId,
      `New memory saved: ${memory.title}`,
      [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${memory.title}*\n${memory.summary}\n\n📌 Feature: \`${memory.featureType}\``,
          },
        },
      ]
    );
  } catch (error) {
    console.error('Error triggering memory integrations:', error);
    // Don't throw - integration failure shouldn't block main operations
  }
}

/**
 * HTTP Cloud Function - Retrieve relevant memories for API context injection
 * Called from Next.js API routes to get semantically similar memories
 */
export const retrieveMemories = functions.https.onRequest(
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { userId, query, featureType, limit } = req.body;

      if (!userId || !query) {
        res.status(400).json({
          error: 'Missing required fields: userId, query',
        });
        return;
      }

      // Import inside function to avoid circular dependencies
      const { retrieveRelevantMemories } = await import('./ragMemoryService');

      const memories = await retrieveRelevantMemories(
        userId,
        query,
        featureType,
        limit || 5
      );

      res.status(200).json({
        success: true,
        memories,
        count: memories.length,
      });
    } catch (error: any) {
      console.error('[RETRIEVE_MEMORIES_ERROR]', error);
      res.status(500).json({
        error: 'Failed to retrieve memories',
        details: error.message,
      });
    }
  }
);



/**
 * Prepare memory context for API injection
 * Called from Next.js API routes to get relevant memories
 */
export async function getMemoryContextForApi(
  userId: string,
  query: string,
  featureType?: string
): Promise<string> {
  try {
    // This would call into ragMemoryService
    // For now, return empty string - implementation in next section
    return '';
  } catch (error) {
    console.error('Error getting memory context:', error);
    return '';
  }
}

/**
 * HTTP Cloud Function - Get user memory statistics
 * Called from Next.js to gather memory stats for user context
 */
export const getMemoryStats = functions.https.onRequest(
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: 'Missing userId' });
        return;
      }

      const db = admin.firestore();

      // Get all memories for user
      const memoriesSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('memories')
        .get();

      const memories = memoriesSnapshot.docs.map((doc) => doc.data() as UserMemory);

      // Calculate statistics
      let totalTokensUsed = 0;
      let lastInteractionDate: number | undefined;
      const featureTypes: Map<string, number> = new Map();
      const allTags: Map<string, number> = new Map();

      memories.forEach((memory) => {
        // Get tokens from metadata if available
        if (memory.metadata?.tokensUsed) {
          totalTokensUsed += memory.metadata.tokensUsed;
        }
        
        // Get latest interaction time
        if (memory.createdAt) {
          const createdTime = typeof memory.createdAt === 'number' 
            ? memory.createdAt 
            : Date.parse(String(memory.createdAt));
          
          if (!lastInteractionDate || createdTime > lastInteractionDate) {
            lastInteractionDate = createdTime;
          }
        }

        // Count feature types
        if (memory.featureType) {
          featureTypes.set(
            memory.featureType,
            (featureTypes.get(memory.featureType) || 0) + 1
          );
        }

        // Count tags
        if (memory.tags && Array.isArray(memory.tags)) {
          memory.tags.forEach((tag) => {
            allTags.set(tag, (allTags.get(tag) || 0) + 1);
          });
        }
      });

      // Get top features (by frequency)
      const topFeatures = Array.from(featureTypes.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([feature]) => feature);

      // Get top tags (by frequency)
      const topTags = Array.from(allTags.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tag]) => tag);

      console.log(`[getMemoryStats] User ${userId}: ${memories.length} memories, ${totalTokensUsed} tokens`);

      res.status(200).json({
        success: true,
        totalMemories: memories.length,
        totalTokensUsed,
        lastInteractionDate: lastInteractionDate ? new Date(lastInteractionDate).toISOString() : undefined,
        topFeatures,
        topTags,
      });
    } catch (error) {
      console.error('Error getting memory stats:', error);
      res.status(500).json({
        error: `Failed to get memory stats: ${error}`,
      });
    }
  }
);
