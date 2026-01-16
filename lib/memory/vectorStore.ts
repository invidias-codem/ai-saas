
import { supabase } from '../supabaseClient';
import { generateEmbedding } from './embedding';

export type MemoryType = 'conversation_summary' | 'fact' | 'preference';

export interface Memory {
    id: string;
    userId: string;
    content: string;
    type: MemoryType;
    metadata?: any;
    similarity?: number;
    createdAt: string;
}

/**
 * Stores a new memory in Supabase with its vector embedding.
 */
export async function storeMemory(
    userId: string,
    content: string,
    type: MemoryType,
    metadata: any = {}
): Promise<string | null> {
    try {
        const embedding = await generateEmbedding(content);

        // Compress content for storage to save space
        const { compress } = await import('@/lib/compression');
        const compressedContent = compress(content);

        const { data, error } = await supabase
            .from('memory_bank')
            .insert({
                user_id: userId,
                content: compressedContent,
                embedding, // Supabase pgvector handles array -> vector conversion
                type,
                metadata
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
 * Searches for relevant memories using vector similarity.
 * Calls RPC function 'match_memories'.
 */
export async function searchMemories(
    userId: string,
    query: string,
    limit: number = 5
): Promise<Memory[]> {
    try {
        const queryEmbedding = await generateEmbedding(query);
        const { decompress } = await import('@/lib/compression');

        const { data, error } = await supabase.rpc('match_memories', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5, // Adjust threshold as needed
            match_count: limit,
            p_user_id: userId
        });

        if (error) {
            console.error('Supabase search error:', error);
            throw error;
        }

        return data.map((item: any) => ({
            id: item.id,
            userId: userId,
            content: decompress(item.content), // Decompress content (handles legacy safely)
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


/**
 * Retrieves memory statistics for a user.
 */
export async function getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    lastInteractionDate: Date | undefined;
}> {
    try {
        // Get count
        const { count, error: countError } = await supabase
            .from('memory_bank')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (countError) throw countError;

        // Get last interaction
        const { data: lastMemory, error: lastError } = await supabase
            .from('memory_bank')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // It's okay if no memory found (lastError might be 'Row not found')

        return {
            totalMemories: count || 0,
            lastInteractionDate: lastMemory ? new Date(lastMemory.created_at) : undefined
        };
    } catch (error) {
        console.error('Error getting memory stats:', error);
        return { totalMemories: 0, lastInteractionDate: undefined };
    }
}

/**
 * Retrieves the count of memories for a user.
 */
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
