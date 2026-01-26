
import { ExtractedFact } from '@/lib/types/imports';
import { supabaseAdmin } from '@/lib/supabase'; // Use admin client for high-privilege inserts if needed, or normal client
import { OpenAIEmbeddings } from "@langchain/openai";

// Reuse existing mapping logic or define new
function mapFactTypeToMemoryType(type: ExtractedFact['type']): string {
    switch (type) {
        case 'preference': return 'preference';
        case 'action_item': return 'task';
        case 'decision': return 'fact'; // or decision specific?
        default: return 'fact';
    }
}

interface StoredMemory {
    id: string;
    content: string;
    // ... other fields
}

export async function storeImportedMemories(
    userId: string,
    facts: ExtractedFact[]
): Promise<string[]> {
    if (facts.length === 0) return [];

    const ids: string[] = [];
    const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Process in batches of 10 to avoid hitting limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < facts.length; i += BATCH_SIZE) {
        const batch = facts.slice(i, i + BATCH_SIZE);

        // Generate embeddings parallel
        const vectors = await embeddings.embedDocuments(batch.map(f => f.content));

        const records = batch.map((fact, idx) => ({
            user_id: userId,
            content: fact.content,
            embedding: vectors[idx],
            type: mapFactTypeToMemoryType(fact.type),
            confidence: fact.confidence,
            scope: 'persistent',
            metadata: {
                source: 'import',
                sourceConversationId: fact.sourceConversationId,
                importedAt: new Date().toISOString(),
                extractionType: fact.type
            },
            created_at: new Date().toISOString()
        }));

        const { data, error } = await supabaseAdmin
            .from('memory_bank')
            .insert(records)
            .select('id');

        if (error) {
            console.error('Error storing imported memories:', error);
            // Continue with other batches? Or fail?
            // For now log and continue
        } else if (data) {
            ids.push(...data.map(d => d.id));
        }
    }

    return ids;
}

export async function createImportJob(
    userId: string,
    sourcePlatform: string,
    totalConversations: number,
    metadata: any = {}
): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from('import_jobs')
        .insert({
            user_id: userId,
            source_platform: sourcePlatform,
            status: 'processing',
            total_conversations: totalConversations,
            started_at: new Date().toISOString(),
            metadata
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to create import job:', error);
        throw new Error('Failed to track import job');
    }

    return data.id;
}

export async function updateImportJob(
    jobId: string,
    updates: {
        status?: 'completed' | 'failed' | 'partial' | 'processing';
        processed_conversations?: number;
        imported_memories?: number;
        extracted_facts?: number;
        error_log?: any[];
        completed_at?: string;
    }
) {
    const { error } = await supabaseAdmin
        .from('import_jobs')
        .update(updates)
        .eq('id', jobId);

    if (error) console.error('Failed to update import job:', error);
}
