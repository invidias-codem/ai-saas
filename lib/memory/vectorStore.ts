import { supabase } from '../supabaseClient';
import { generateEmbeddingWithMetadata } from './embedding';

export type MemoryType = 'conversation_summary' | 'fact' | 'preference';
export type MemoryScope = 'conversation' | 'user' | 'workspace';

export interface MemoryWriteOptions {
    scope?: MemoryScope;
    workspaceId?: string | null;
}

export interface Memory {
    id: string;
    userId: string;
    content: string;
    type: MemoryType;
    metadata?: any;
    similarity?: number;
    createdAt: string;
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

function getMemoryRpcName(dimension: 768 | 3072): 'match_memories_768' | 'match_memories_3072' {
    return dimension === 768 ? 'match_memories_768' : 'match_memories_3072';
}

/**
 * Lists memories for a user with pagination.
 */
export async function listMemories(
    userId: string,
    limit: number = 20,
    offset: number = 0
): Promise<Memory[]> {
    try {
        const { safeDecompress } = await import('@/lib/compression');

        const { data, error } = await supabase
            .from('memory_bank')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        return data.map((item: any) => ({
            id: item.id,
            userId: userId,
            content: safeDecompress(item.content),
            type: item.type,
            metadata: item.metadata,
            createdAt: item.created_at
        }));
    } catch (error) {
        console.error('Error listing memories:', error);
        return [];
    }
}

/**
 * Stores a new memory in Supabase with provider/dimension-aware embeddings.
 */
export async function storeMemory(
    userId: string,
    content: string,
    type: MemoryType,
    metadata: any = {},
    options: MemoryWriteOptions = {}
): Promise<string | null> {
    try {
        const embeddingResult = await generateEmbeddingWithMetadata(content);

        const { compress } = await import('@/lib/compression');
        const compressedContent = compress(content);
        const scope: MemoryScope = options.scope || 'conversation';
        const normalizedMetadata = {
            ...metadata,
            ...(scope === 'workspace' && options.workspaceId
                ? { workspaceId: options.workspaceId, scopeHint: 'workspace', scopeLocked: true, allowUserPromotion: false }
                : {}),
        };

        const { data, error } = await supabase
            .from('memory_bank')
            .insert({
                user_id: userId,
                content: compressedContent,
                type,
                scope,
                metadata: normalizedMetadata,
                ...buildEmbeddingColumnPatch(embeddingResult),
            })
            .select('id')
            .single();

        if (error) {
            console.error('Supabase error storing memory:', error);
            throw error;
        }

        return data.id;
    } catch (error) {
        console.error('Failed to store memory:', error);
        return null;
    }
}

/**
 * Searches for relevant memories using dimension-aware vector similarity RPCs.
 */
export async function searchMemories(
    userId: string,
    query: string,
    limit: number = 5,
    featureType?: string
): Promise<Memory[]> {
    try {
        const embeddingResult = await generateEmbeddingWithMetadata(query);
        const { safeDecompress } = await import('@/lib/compression');
        const rpcName = getMemoryRpcName(embeddingResult.dimension);

        console.info('[VectorStore] Using retrieval lane', {
            rpcName,
            provider: embeddingResult.provider,
            model: embeddingResult.model,
            dimension: embeddingResult.dimension,
        });

        const { data, error } = await supabase.rpc(rpcName, {
            query_embedding: embeddingResult.vector,
            match_threshold: 0.5,
            match_count: limit,
            filter_user_id: userId,
            filter_feature_type: featureType || null
        });

        if (error) {
            console.error('Supabase search error:', error);
            throw error;
        }

        return data.map((item: any) => ({
            id: item.id,
            userId: userId,
            content: safeDecompress(item.content),
            type: item.type,
            metadata: item.metadata,
            similarity: item.similarity,
            createdAt: item.created_at
        }));

    } catch (error) {
        console.error('Error searching memories:', error);
        return [];
    }
}

export async function getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    lastInteractionDate: Date | undefined;
}> {
    try {
        const { count, error: countError } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) throw countError;

        const { data: lastMemory } = await supabase
            .from('memory_bank')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return {
            totalMemories: count || 0,
            lastInteractionDate: lastMemory ? new Date(lastMemory.created_at) : undefined
        };
    } catch (error) {
        console.error('Error getting memory stats:', error);
        return { totalMemories: 0, lastInteractionDate: undefined };
    }
}

export async function getMemoryCount(userId: string): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (error) throw error;

        return count || 0;
    } catch (error) {
        console.error('Error getting memory count:', error);
        return 0;
    }
}

export async function deleteMemory(memoryId: string, userId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('memory_bank')
            .delete()
            .eq('id', memoryId)
            .eq('user_id', userId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting memory:', error);
        return false;
    }
}

const MAX_MEMORY_CONTENT_LENGTH = 50000;

export async function updateMemory(
    memoryId: string,
    userId: string,
    newContent: string
): Promise<boolean> {
    if (!newContent || newContent.trim().length === 0) {
        console.error('Cannot update memory with empty content');
        return false;
    }
    if (newContent.length > MAX_MEMORY_CONTENT_LENGTH) {
        console.error(`Memory content exceeds maximum length of ${MAX_MEMORY_CONTENT_LENGTH}`);
        return false;
    }
    try {
        const { compress } = await import('@/lib/compression');
        const compressedContent = compress(newContent);
        const embeddingResult = await generateEmbeddingWithMetadata(newContent);

        const { error } = await supabase
            .from('memory_bank')
            .update({
                content: compressedContent,
                ...buildEmbeddingColumnPatch(embeddingResult),
            })
            .eq('id', memoryId)
            .eq('user_id', userId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating memory:', error);
        return false;
    }
}
