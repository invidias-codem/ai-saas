import {
  captureMemory,
  extractTags,
  generateSummary,
  estimateTokenCount,
} from '@/lib/ragMemory';
import { tagMessagesForStorage, tagLLMMessage, extractWMRTMetadata } from '@/lib/world-model/trustTag';
import { storeMemory } from '@/lib/memory/vectorStore';
import { runBackgroundOptimization, InteractionFeedback } from '@/lib/ucol/routing/backgroundOptimizer';
import { addNode } from '@/lib/memory/graphStore';
import { trackAIGeneration, trackCreditsDeducted } from "@/lib/analytics/track";
import { supabaseAdmin } from '@/lib/supabaseClient';

export interface PostGenerationPipelineParams {
  userId: string;
  conversationId?: string | null;
  workspaceId?: string | null;
  operatingProfileId?: string | null;
  operatingProfileMode?: string | null;
  requestId: string;
  
  userQuery: string;
  responseText: string;
  history: { role: string; text: string }[];
  fileData?: { name?: string; type?: string; base64Data: string; mimeType?: string } | null;
  
  modelId: string;
  cost?: number;
  bypassCredits?: boolean;
  
  featureType: 'code' | 'chat';
  
  intelligentFacts?: any[];
  routingDecision?: any;
  
  userContext: {
    fullName: string;
    email: string;
    interactionStyle?: string;
  };
  
  saveToMemory?: boolean;
  
  // If true, the pipeline will persist BOTH user and assistant messages.
  // If false, it only persists the assistant message (e.g., if user message was already saved).
  persistUserMessage?: boolean; 
}

function chunkText(text: string, size: number = 2000): string[] {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export async function runPostGenerationPipeline(params: PostGenerationPipelineParams) {
  const {
    userId,
    conversationId,
    workspaceId,
    operatingProfileId,
    operatingProfileMode,
    requestId,
    userQuery,
    responseText,
    history,
    fileData,
    modelId,
    cost = 0,
    bypassCredits = false,
    featureType,
    intelligentFacts = [],
    routingDecision,
    userContext,
    saveToMemory = false,
    persistUserMessage = true,
  } = params;

  try {
    const tokensUsed = estimateTokenCount(userQuery + responseText);
    const tags = extractTags(userQuery);
    const summary = generateSummary([
      { role: 'user', content: userQuery },
      { role: 'assistant', content: responseText }
    ]);

    // ── RFC-001 WMRT: Tag all messages with trust tier before storage ──
    const rawHistory = history.map(msg => ({
      role: (msg.role === 'bot' || msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user') as "user" | "assistant" | "system",
      content: msg.text,
    }));
    
    const taggedHistory = tagMessagesForStorage(rawHistory, modelId);
    
    // Append the current turn
    taggedHistory.push(
      { role: 'user', content: userQuery, trust_tier: 'UNVERIFIED' as const, tagged_at: new Date().toISOString() },
      tagLLMMessage(responseText, modelId),
    );
    const wmrtMeta = extractWMRTMetadata(taggedHistory, modelId);
    // ──────────────────────────────────────────────────────────────────

    // 1. Memory Capture
    captureMemory(
      userId,
      featureType,
      userQuery.substring(0, 50) || `${featureType} Assistance`,
      summary,
      taggedHistory,
      tokensUsed,
      tags,
      {
        userName: userContext.fullName,
        userEmail: userContext.email,
        responseLength: responseText.length,
        interactionStyle: userContext.interactionStyle,
        workspaceId: workspaceId || null,
        operatingProfileId: operatingProfileId || null,
        operatingProfileMode: operatingProfileMode || null,
        hasFileAttachment: !!fileData,
        fileName: fileData?.name,
        ...wmrtMeta,
      }
    ).catch(err => console.error('[WMRT] Memory capture failed:', err));

    // 2. RAG Indexing for Attached Files (Explicit Save)
    if (saveToMemory && fileData && fileData.base64Data) {
      (async () => {
        try {
          const decodedContent = Buffer.from(fileData.base64Data, 'base64').toString('utf-8');
          const fileName = fileData.name || 'uploaded_file';

          // Heuristic check to avoid binary indexing
          if (/[\x00-\x08\x0E-\x1F]/.test(decodedContent.substring(0, 100))) {
            console.warn(`[Code RAG] Skipping indexing for ${fileName} - appears binary.`);
            return;
          }

          const chunks = chunkText(decodedContent, 3000); 
          let indexedCount = 0;
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const contextPrefix = `[File: ${fileName} | Part ${i + 1}/${chunks.length}]\n`;

            await storeMemory(
              userId,
              contextPrefix + chunk,
              'fact', 
              {
                featureType,
                fileName: fileName,
                chunkIndex: i,
                totalChunks: chunks.length,
                language: fileData.type
              }
            );
            indexedCount++;
          }
        } catch (err) {
          console.error('[Code RAG] Indexing failed:', err);
        }
      })();
    }

    // 3. Background Optimizer
    (async () => {
      try {
        const usedMemoryIds = intelligentFacts.map((f: any) => f.id).filter(Boolean);
        
        const feedback: InteractionFeedback = {
          frustrationSignal: routingDecision?.intent?.urgency === 'high',
          semanticSentiment: 0.1, 
        };

        const newMemories = [];
        if (summary) {
            newMemories.push({
                content: summary,
                type: 'conversation_summary' as any,
                scope: 'conversation' as any,
                metadata: { source: `${featureType}_api`, requestId }
            });
        }

        await runBackgroundOptimization({
           userId,
           workspaceId: workspaceId || undefined,
           usedMemoryIds,
           feedback,
           newMemories
        });
      } catch (err) {
        console.error('[BackgroundOptimizer] Fire-and-forget optimization failed:', err);
      }
    })();

    // 4. Knowledge Graph Extraction
    (async () => {
      try {
        if (tags.length > 0) {
          const codeRelatedTags = tags.filter(tag =>
            /react|node|python|javascript|typescript|java|api|database|framework|library/i.test(tag)
          );
          if (codeRelatedTags.length > 0) {
            await addNode(userId, codeRelatedTags[0], 'technology', `Extracted from session: ${userQuery.substring(0, 30)}`);
          }
        }
      } catch (e) {
        console.error('Graph update failed', e);
      }
    })();

    // 5. Database Message Persistence
    if (conversationId && supabaseAdmin) {
      try {
        if (persistUserMessage) {
          const { error: persistUserError } = await supabaseAdmin
            .from('messages')
            .insert({
              conversation_id: conversationId,
              role: 'user',
              content: userQuery.trim() || (fileData ? `[Analysing File: ${fileData?.name || 'attached file'}]` : ''),
              metadata: {
                fileData: fileData ? {
                  name: fileData.name,
                  type: fileData.type,
                  base64Data: fileData.base64Data,
                } : null,
                featureType,
              },
            });

          if (persistUserError) console.error('[API] Failed to persist user message:', persistUserError);
        }

        const { error: persistAssistantError } = await supabaseAdmin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'bot', // We usually store bot/assistant here.
            content: responseText,
            metadata: { featureType, ...wmrtMeta },
          });

        if (persistAssistantError) console.error('[API] Failed to persist assistant message:', persistAssistantError);
      } catch (persistErr) {
        console.error('[API] Exception persisting messages:', persistErr);
      }
    }

    // 6. Analytics & Logging
    console.log(`[${featureType.toUpperCase()}] User: ${userContext.fullName} (${userId}) | Query: ${userQuery.substring(0, 50)}... | Tokens: ${tokensUsed}`);

    void trackAIGeneration({ tool: featureType, userId, success: true });
    if (!bypassCredits && cost > 0) {
      void trackCreditsDeducted({ tool: featureType, credits: cost, userId });
    }

  } catch (err) {
    console.error(`[PostGenerationPipeline] Error in background pipeline for ${featureType}:`, err);
  }
}
