import { supabase } from '@/lib/supabaseClient';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';
import { determineMemoryScopeForFact, shouldPromoteMemory, promoteToUserScope } from '@/lib/memoryPromotion';

export interface ExtractedFact {
  type: "skill" | "preference" | "goal" | "personal" | "project" | "tool";
  value: string;
  confidence: number;
}

export type FactStorageScope = 'conversation' | 'user' | 'workspace';

export interface FactExtractionResult {
  facts: ExtractedFact[];
  promotedCount: number;
  storedCount: number;
}

const GEMINI_FLASH_MODEL = "gemini-3.1-flash-lite";

function stripThoughtSignature(text: string): string {
  return text.replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, '').trim();
}

function extractFirstJsonPayload(text: string): string {
  const cleaned = stripThoughtSignature(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = fenced ? fenced[1].trim() : cleaned;

  const firstArray = source.indexOf('[');
  const lastArray = source.lastIndexOf(']');
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    return source.slice(firstArray, lastArray + 1);
  }

  const firstObj = source.indexOf('{');
  const lastObj = source.lastIndexOf('}');
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return source.slice(firstObj, lastObj + 1);
  }

  return source;
}

function buildEmbeddingColumnPatch(embeddingResult: Awaited<ReturnType<typeof generateEmbeddingWithMetadata>>) {
  const now = new Date().toISOString();
  return embeddingResult.dimension === 768
    ? {
        embedding: embeddingResult.vector,
        embedding_768: embeddingResult.vector,
        embedding_provider: embeddingResult.provider,
        embedding_model: embeddingResult.model,
        embedding_updated_at: now,
      }
    : {
        embedding_3072: embeddingResult.vector,
        embedding_provider: embeddingResult.provider,
        embedding_model: embeddingResult.model,
        embedding_updated_at: now,
      };
}

/**
 * Extracts structured facts from conversation using Gemini Flash
 */
export async function extractFactsFromConversation(
  userQuery: string,
  assistantResponse: string
): Promise<ExtractedFact[]> {
  try {
    const geminiProvider = new GeminiProvider();

    const systemPrompt = `You are a fact extraction agent. Analyze the conversation between a user and an AI assistant to extract structured facts about the user.

Extract facts in these categories:
- skill: Technical abilities, languages, frameworks (e.g., "Python", "React", "Machine Learning")
- preference: Likes, dislikes, preferred ways of working (e.g., "prefers TypeScript over JavaScript", "likes minimal design")  
- goal: Objectives, targets, things they want to achieve (e.g., "wants to launch SaaS by March", "learning Rust")
- personal: Personal information, background (e.g., "works at Google", "lives in San Francisco", "has 5 years experience")
- project: Current or past projects they mention (e.g., "building an e-commerce app", "worked on mobile banking")
- tool: Software, services, platforms they use (e.g., "uses VS Code", "deploys on AWS", "designs in Figma")

For each fact, assign a confidence score:
- 0.9-1.0: Explicitly stated ("I use React", "I work at Microsoft")
- 0.7-0.89: Clearly implied ("my React app", "our team at Google")  
- 0.5-0.69: Moderately implied (asking specific technical questions)
- 0.3-0.49: Weakly implied (context suggests but not clear)
- 0.0-0.29: Very uncertain

Return ONLY a valid JSON array of facts:
[
  {
    "type": "skill",
    "value": "React development",
    "confidence": 0.95
  }
]

Return empty array [] if no facts can be extracted.`;

    const conversationText = `User: ${userQuery}\n\nAssistant: ${assistantResponse}`;

    const result = await geminiProvider.generateStream(
      [{ role: 'user', text: conversationText }],
      systemPrompt,
      {
        model: GEMINI_FLASH_MODEL,
        temperature: 0.1,
        maxTokens: 2048
      }
    );

    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullResponse += decoder.decode(value, { stream: true });
    }

    try {
      const jsonText = extractFirstJsonPayload(fullResponse);
      const facts = JSON.parse(jsonText) as ExtractedFact[];

      return facts.filter(fact =>
        fact.type &&
        fact.value &&
        fact.confidence >= 0.3 &&
        fact.confidence <= 1.0
      );
    } catch (parseError) {
      console.error('[FactExtractor] Failed to parse JSON response:', parseError);
      console.error('[FactExtractor] Raw response:', fullResponse);
      return [];
    }
  } catch (error) {
    console.error('[FactExtractor] Error extracting facts:', error);
    return [];
  }
}

/**
 * Stores facts in memory_bank table with proper scope and type
 */
export async function storeExtractedFacts(
  userId: string,
  conversationId: string,
  facts: ExtractedFact[],
  metadata: any = {}
): Promise<{ stored: string[], errors: any[] }> {
  const stored: string[] = [];
  const errors: any[] = [];

  for (const fact of facts) {
    try {
      const embeddingResult = await generateEmbeddingWithMetadata(fact.value);

      const workspaceId = typeof metadata?.workspaceId === 'string' ? metadata.workspaceId : null;
      const scope: FactStorageScope = determineMemoryScopeForFact({
        type: fact.type,
        confidence: fact.confidence,
        workspaceId,
      });

      const { data, error } = await supabase
        .from('memory_bank')
        .insert({
          user_id: userId,
          source_conversation_id: conversationId,
          type: fact.type,
          content: fact.value,
          scope,
          confidence: fact.confidence,
          ...buildEmbeddingColumnPatch(embeddingResult),
          metadata: {
            ...metadata,
            extractedAt: new Date().toISOString(),
            extractionMethod: 'llm-powered',
            scopeHint: scope,
            allowUserPromotion: scope !== 'workspace',
            scopeLocked: scope === 'workspace',
          }
        })
        .select('id')
        .single();

      if (error) {
        console.error(`[FactExtractor] Error storing fact "${fact.value}":`, error);
        errors.push({ fact, error });
      } else if (data) {
        stored.push(data.id);
        console.log(`[FactExtractor] Stored fact: ${fact.value} (confidence: ${fact.confidence}, scope: ${scope})`);
      }
    } catch (error) {
      console.error(`[FactExtractor] Exception storing fact "${fact.value}":`, error);
      errors.push({ fact, error });
    }
  }

  return { stored, errors };
}

/**
 * Promotes high-confidence personal facts to user scope
 */
export async function promoteHighConfidenceFacts(
  userId: string,
  conversationId: string,
  facts: ExtractedFact[]
): Promise<number> {
  let promotedCount = 0;

  const { data: memories, error } = await supabase
    .from('memory_bank')
    .select('*')
    .eq('user_id', userId)
    .eq('source_conversation_id', conversationId)
    .eq('scope', 'conversation')
    .gte('confidence', 0.85);

  if (error || !memories) {
    console.error('[FactExtractor] Error fetching memories for promotion:', error);
    return 0;
  }

  for (const memory of memories) {
    const promotableMemory = {
      id: memory.id,
      content: memory.content,
      type: memory.type,
      confidence: memory.confidence,
      scope: memory.scope as 'conversation' | 'user',
      source_conversation_id: memory.source_conversation_id
    };

    if (shouldPromoteMemory(promotableMemory)) {
      const success = await promoteToUserScope(userId, memory.id);
      if (success) promotedCount++;
    }
  }

  console.log(`[FactExtractor] Promoted ${promotedCount} facts to user scope`);
  return promotedCount;
}

/**
 * Main function to extract and store facts from a conversation
 */
export async function processConversationFacts(
  userId: string,
  conversationId: string,
  userQuery: string,
  assistantResponse: string,
  metadata: any = {}
): Promise<FactExtractionResult> {
  try {
    console.log(`[FactExtractor] Processing facts for conversation ${conversationId}`);

    const facts = await extractFactsFromConversation(userQuery, assistantResponse);
    console.log(`[FactExtractor] Extracted ${facts.length} facts`);

    if (facts.length === 0) {
      return { facts: [], promotedCount: 0, storedCount: 0 };
    }

    const { stored, errors } = await storeExtractedFacts(userId, conversationId, facts, metadata);

    if (errors.length > 0) {
      console.warn(`[FactExtractor] ${errors.length} errors occurred while storing facts`);
    }

    const promotedCount = await promoteHighConfidenceFacts(userId, conversationId, facts);

    return {
      facts,
      promotedCount,
      storedCount: stored.length
    };
  } catch (error) {
    console.error('[FactExtractor] Error in processConversationFacts:', error);
    return { facts: [], promotedCount: 0, storedCount: 0 };
  }
}

/**
 * Utility function to get recent facts for a user
 */
export async function getUserRecentFacts(
  userId: string,
  limit: number = 20,
  scope?: 'conversation' | 'user'
): Promise<any[]> {
  try {
    let query = supabase
      .from('memory_bank')
      .select('*')
      .eq('user_id', userId);

    if (scope) {
      query = query.eq('scope', scope);
    }

    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[FactExtractor] Error fetching recent facts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[FactExtractor] Exception fetching recent facts:', error);
    return [];
  }
}
