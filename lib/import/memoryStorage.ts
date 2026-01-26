import { ExtractedFact } from '@/lib/types/imports';
import { supabase } from '@/lib/supabaseClient';

// Helper to map extraction types to memory types
function mapFactTypeToMemoryType(type: ExtractedFact['type']): string {
    switch (type) {
        case 'preference': return 'preference';
        case 'action_item': return 'task';
        case 'decision': return 'fact';
        default: return 'fact';
    }
}

// Native fetch implementation to avoid langchain dependency issues
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not defined');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                input: texts,
                model: 'text-embedding-ada-002'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI Embedding Error:', errorText);
            throw new Error(`OpenAI API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.data.map((item: any) => item.embedding);
    } catch (error) {
        console.error('Failed to generate embeddings:', error);
        throw error;
    }
}

export async function storeImportedMemories(
    userId: string,
    facts: ExtractedFact[]
): Promise<string[]> {
    if (facts.length === 0) return [];

    const ids: string[] = [];

    // Process in batches of 10 to avoid hitting limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < facts.length; i += BATCH_SIZE) {
        const batch = facts.slice(i, i + BATCH_SIZE);

        try {
            // Generate embeddings parallel (using native fetch)
            const vectors = await generateEmbeddings(batch.map(f => f.content));

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

            const { data, error } = await supabase
                .from('memory_bank')
                .insert(records)
                .select('id');

            if (error) {
                console.error('Error storing imported memories:', error);
            } else if (data) {
                ids.push(...data.map((d: { id: string }) => d.id));
            }
        } catch (err) {
            console.error('Error processing batch:', err);
        }
    }

    return ids;
}

interface ImportJobMetadata {
    fileName?: string;
    originalFormat?: string;
    importedAt?: string;
    [key: string]: unknown;
}

export async function createImportJob(
    userId: string,
    sourcePlatform: string,
    totalConversations: number,
    metadata: ImportJobMetadata = {}
): Promise<string> {
    const { data, error } = await supabase
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
    const { error } = await supabase
        .from('import_jobs')
        .update(updates)
        .eq('id', jobId);

    if (error) console.error('Failed to update import job:', error);
}
