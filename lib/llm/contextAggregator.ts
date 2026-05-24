import {
  getRAGMemoryContext,
  gatherUserContext,
  formatUserContextForPrompt,
  getHighConfidenceFacts,
  formatFactsForPrompt,
  getGitHubContext,
  getWorkspaceMemoryContext,
} from '@/lib/ragMemory';
import { rankMemoriesIntelligently } from '@/lib/intelligentMemory';
import { findRelatedEntities, formatGraphContext } from '@/lib/memory/graphStore';
import { performResearch, formatSearchResults } from '@/lib/agents/researcher';
import { getUserProfile, formatUserProfileForPrompt } from '@/lib/memoryPromotion';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { logger } from "@/lib/logger";
import { ContextTokenManager } from '@/lib/context/ContextTokenManager';
import { PreparedContextSections } from '@/lib/context/types';
import type { FileAttachmentInput } from '@/lib/types/attachments';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { embedDocumentChunk } from '@/lib/documents/indexDocument';
import { EmbeddingTier } from '@/lib/types/documents';

export async function getAttachedDocumentContext(
  userQuery: string,
  workspaceId: string,
  documentIds: string[]
): Promise<string> {
  if (!documentIds || !documentIds.length || !workspaceId) return '';

  try {
     const [embed768, embed3076] = await Promise.all([
         embedDocumentChunk(userQuery, EmbeddingTier.STANDARD_768).catch(() => null),
         embedDocumentChunk(userQuery, EmbeddingTier.HIGH_RES_3076).catch(() => null)
     ]);

     let allChunks: any[] = [];

     if (embed768 && supabaseAdmin) {
       const { data } = await supabaseAdmin.rpc('match_document_chunks_768', {
           query_embedding: embed768,
           match_threshold: 0.1,
           match_count: 10,
           filter_workspace_id: workspaceId,
           filter_document_ids: documentIds
       });
       if (data) allChunks = [...allChunks, ...data];
     }

     if (embed3076 && supabaseAdmin) {
       const { data } = await supabaseAdmin.rpc('match_document_chunks_3076', {
           query_embedding: embed3076,
           match_threshold: 0.1,
           match_count: 10,
           filter_workspace_id: workspaceId,
           filter_document_ids: documentIds
       });
       if (data) allChunks = [...allChunks, ...data];
     }
     
     // Deduplicate chunks by ID
     const uniqueChunks = new Map();
     allChunks.forEach(c => uniqueChunks.set(c.id, c));

     // Group by document to hydrate exactly once per document if COLD
     const chunksByDocument = new Map<string, any[]>();
     uniqueChunks.forEach((chunk) => {
       if (!chunksByDocument.has(chunk.document_id)) chunksByDocument.set(chunk.document_id, []);
       chunksByDocument.get(chunk.document_id)!.push(chunk);
     });

     const contextParts: string[] = [];

     for (const [docId, chunks] of chunksByDocument.entries()) {
       const firstChunk = chunks[0];
       
       if (firstChunk.storage_state === 'COLD' && firstChunk.storage_uri) {
         try {
           let hydratedText: string | null = null;
           const cacheKey = `doc_hydrate:${docId}`;
           
           // Optional: import Redis for caching
           const { Redis } = await import('@upstash/redis');
           const redis = process.env.UPSTASH_REDIS_REST_URL 
              ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN || '' }) 
              : null;
              
           if (redis) {
             hydratedText = await redis.get<string>(cacheKey);
           }

           if (!hydratedText) {
             console.log(`[Hydration] Fetching COLD blob for doc ${docId} from ${firstChunk.storage_uri}`);
             const { data: blobData, error: blobError } = await supabaseAdmin
               .storage
               .from('archived_documents')
               .download(firstChunk.storage_uri);
               
             if (blobError || !blobData) throw blobError || new Error("Blob missing");

             const buffer = Buffer.from(await blobData.arrayBuffer());
             const { LLMArithmeticCompressor } = await import('@/lib/documents/compressor');
             hydratedText = await LLMArithmeticCompressor.decompress(buffer);
             
             if (redis && hydratedText) {
               // Cache for 1 hour to prevent redundant decompressions
               await redis.set(cacheKey, hydratedText, { ex: 3600 });
             }
           } else {
             console.log(`[Hydration] Cache HIT for doc ${docId}`);
           }

           contextParts.push(`[System: Accessing archived memories...]\n\nDocument ID: ${docId}\nDecompressed Content:\n${hydratedText}`);
         } catch (e) {
           console.error(`[Hydration] Failed to decompress doc ${docId}`, e);
         }
       } else {
         for (const chunk of chunks) {
           if (chunk.content) contextParts.push(chunk.content);
         }
       }
     }

     if (contextParts.length === 0) return '';

     return `## Attached Documents Context\n${contextParts.join('\n\n---\n\n')}`;
  } catch (err) {
     console.error('[DocumentContext] Failed to retrieve document context', err);
     return '';
  }
}

export interface ContextAggregatorParams {
  userId: string;
  clerkUser: any;
  userQuery: string;
  fileData?: FileAttachmentInput;
  activeRepo?: string;
  resolvedContext: any;
  routingDecision: any;
  initialModelConfig: typeof CODE_MODELS[keyof typeof CODE_MODELS];
}

export async function gatherCodeContext(params: ContextAggregatorParams) {
  const { userId, clerkUser, userQuery, fileData, activeRepo, resolvedContext, routingDecision, initialModelConfig } = params;

  let modelConfig = { ...initialModelConfig };
  const effectiveProfile = resolvedContext.profile;
  const operatingProfileResolvedMode = resolvedContext.mode;
  const operatingProfileName = resolvedContext.operatingProfileName ?? resolvedContext.operatingProfileId ?? 'resolved';
  const effectiveWorkspaceId = resolvedContext.workspaceId;

  const userContext = await gatherUserContext(userId, clerkUser);
  const userContextPrompt = formatUserContextForPrompt(userContext);

  const [
    allFacts,
    researchResult,
    graphData,
    userProfileMemories,
    workspaceMemoryContext,
  ] = await Promise.all([
    getHighConfidenceFacts(userId),
    performResearch(userQuery, userContextPrompt, { hasFileAttachment: !!fileData }),
    findRelatedEntities(userId, userQuery),
    getUserProfile(userId),
    effectiveWorkspaceId ? getWorkspaceMemoryContext(userId, effectiveWorkspaceId, userQuery) : Promise.resolve({ contextString: '', sources: [] })
  ]);

  const searchContext = formatSearchResults(researchResult.results);
  const graphContext = formatGraphContext(graphData);

  const similarities = new Map<string, number>();
  const queryWords = userQuery.toLowerCase().split(/\s+/);
  for (const fact of allFacts) {
    const factWords = fact.content.toLowerCase().split(/\s+/);
    const overlap = factWords.filter((w: string) => queryWords.includes(w)).length;
    const similarity = overlap / Math.max(factWords.length, queryWords.length, 1);
    similarities.set(fact.id || '', Math.min(1, similarity * 1.5));
  }

  const intelligentFacts = rankMemoriesIntelligently(
    allFacts,
    similarities,
    userQuery
  );

  console.log(`[Code Memory Intelligence] Retrieved ${intelligentFacts.length} intelligently ranked facts for user ${userId}`);
  const factContext = formatFactsForPrompt(intelligentFacts);

  const memoryContext = (await getRAGMemoryContext(userId, userQuery, 'code')).contextString;
  const workspaceMemoryPrompt = workspaceMemoryContext.contextString || '';

  let githubContext = '';
  if (activeRepo) {
    try {
      logger.debug(`[Code API] Fetching GitHub context for ${activeRepo}`);
      githubContext = await getGitHubContext(userId, userQuery, activeRepo);
    } catch (err) {
      logger.error("[Code API] Failed to fetch GitHub context:", err);
    }
  }

  const userProfileContext = formatUserProfileForPrompt(userProfileMemories);

  if (effectiveProfile) {
    if (operatingProfileResolvedMode === 'agentic' && CODE_MODELS.agentic) {
      modelConfig = CODE_MODELS.agentic;
    } else if (operatingProfileResolvedMode === 'fast' && CODE_MODELS.fast) {
      modelConfig = CODE_MODELS.fast;
    }
  }

  console.log(`[UCOL Gateway] Code API Routing Intent: ${routingDecision.intent.category} (Confidence: ${routingDecision.intent.confidence}, Urgency: ${routingDecision.intent.urgency})`);

  const preferredModelRef = routingDecision.providerPlan?.preferredModelRefs?.[0];
  if (preferredModelRef && CODE_MODELS[preferredModelRef as keyof typeof CODE_MODELS]) {
      if (routingDecision.intent.confidence > 0.8) {
           modelConfig = CODE_MODELS[preferredModelRef as keyof typeof CODE_MODELS];
      }
  }

  const operatingProfileContext = effectiveProfile
    ? `\n## Coding Runtime Context\nWorkspace: ${effectiveWorkspaceId || 'none'}\nOperating Profile: ${operatingProfileName}\nMode: ${operatingProfileResolvedMode}\nUse this as the active execution context for coding assistance.\n\n---\n`
    : '';

  const baseInstruction = userQuery || `Please analyze the attached file: ${fileData?.name || 'attached file'}`;
  
  let enhancedPromptText = '';
  try {
    const sections: PreparedContextSections = {
      userContextPrompt,
      userProfileContext,
      factContext,
      graphContext,
      searchContext,
      memoryContext: [memoryContext, workspaceMemoryPrompt, githubContext].filter(Boolean).join('\n\n')
    };

    const allocation = ContextTokenManager.assembleContext(
      '',
      sections,
      { modelId: modelConfig.modelId, userQuery }
    );
    enhancedPromptText = allocation.packedContext + '\n\n' + operatingProfileContext + baseInstruction;
  } catch (err) {
    console.warn("[ContextAggregator] Token allocation failed, falling back:", err);
    enhancedPromptText =
      userContextPrompt +
      userProfileContext +
      factContext +
      graphContext +
      searchContext +
      memoryContext +
      workspaceMemoryPrompt +
      githubContext +
      operatingProfileContext +
      baseInstruction;
  }

  return {
    enhancedPromptText,
    modelConfig,
    intelligentFacts,
    userContext
  };
}
