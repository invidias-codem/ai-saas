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
import type { FileAttachmentInput } from '@/lib/types/attachments';
import { resolveAttachmentForAnalysis } from '@/lib/gcp/fileResolver';

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
  fileData?: FileAttachmentInput | null;
  
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
  persistUserMessage?: boolean; 
}

function chunkText(text: string, size: number = 2000): string[] {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function toPersistedFileData(fileData?: FileAttachmentInput | null) {
  if (!fileData) return null;
  return {
    name: fileData.name,
    type: fileData.type,
    mimeType: fileData.mimeType,
    sizeBytes: fileData.sizeBytes,
    fileUri: fileData.fileUri,
    storageProvider: fileData.storageProvider,
  };
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

    const rawHistory = history.map(msg => ({
      role: (msg.role === 'bot' || msg.role === 'model' || msg.role === 'assistant' ? 'assistant' : 'user') as "user" | "assistant" | "system",
      content: msg.text,
    }));
    
    const taggedHistory = tagMessagesForStorage(rawHistory, modelId);
    taggedHistory.push(
      { role: 'user', content: userQuery, trust_tier: 'UNVERIFIED' as const, tagged_at: new Date().toISOString() },
      tagLLMMessage(responseText, modelId),
    );
    const wmrtMeta = extractWMRTMetadata(taggedHistory, modelId);

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
        fileUri: fileData?.fileUri,
        ...wmrtMeta,
      }
    ).catch(err => console.error('[WMRT] Memory capture failed:', err));

    if (saveToMemory && fileData) {
      (async () => {
        try {
          const resolvedAttachment = await resolveAttachmentForAnalysis(fileData);
          const decodedContent = resolvedAttachment.textContent;
          const fileName = resolvedAttachment.name || 'uploaded_file';

          if (!decodedContent) {
            console.warn(`[Code RAG] Skipping indexing for ${fileName} - no text content available.`);
            return;
          }

          const chunks = chunkText(decodedContent, 3000); 
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const contextPrefix = `[File: ${fileName} | Part ${i + 1}/${chunks.length}]\n`;

            await storeMemory(
              userId,
              contextPrefix + chunk,
              'fact', 
              {
                featureType,
                fileName,
                chunkIndex: i,
                totalChunks: chunks.length,
                language: resolvedAttachment.mimeType,
                fileUri: resolvedAttachment.fileUri,
              }
            );
          }
        } catch (err) {
          console.error('[Code RAG] Indexing failed:', err);
        }
      })();
    }

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
                fileData: toPersistedFileData(fileData),
                featureType,
              },
            });

          if (persistUserError) console.error('[API] Failed to persist user message:', persistUserError);
        }

        const { error: persistAssistantError } = await supabaseAdmin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'bot',
            content: responseText,
            metadata: { featureType, ...wmrtMeta },
          });

        if (persistAssistantError) console.error('[API] Failed to persist assistant message:', persistAssistantError);
      } catch (persistErr) {
        console.error('[API] Exception persisting messages:', persistErr);
      }
    }

    console.log(`[${featureType.toUpperCase()}] User: ${userContext.fullName} (${userId}) | Query: ${userQuery.substring(0, 50)}... | Tokens: ${tokensUsed}`);

    void trackAIGeneration({ tool: featureType, userId, success: true });
    if (!bypassCredits && cost > 0) {
      void trackCreditsDeducted({ tool: featureType, credits: cost, userId });
    }

  } catch (err) {
    console.error(`[PostGenerationPipeline] Error in background pipeline for ${featureType}:`, err);
  }
}
