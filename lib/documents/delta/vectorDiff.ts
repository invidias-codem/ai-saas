import { SupabaseClient } from '@supabase/supabase-js';

export interface DriftedChunk {
  newChunkId: string;
  newChunkIndex: number;
  oldChunkId: string | null;
  oldChunkIndex: number | null;
  similarityScore: number;
  reason: 'MODIFIED' | 'NET_NEW';
}

/**
 * Computes semantic drift between two document versions using high-res vector embeddings.
 * Bypasses the need to decompress the old document by relying on the preserved pgvector index.
 */
export async function computeSemanticDrift(
  supabase: SupabaseClient,
  oldDocId: string,
  newDocId: string,
  driftThreshold: number = 0.90
): Promise<DriftedChunk[]> {
  const driftedChunks: DriftedChunk[] = [];

  // 1. Fetch all chunks for the NEW WARM document
  const { data: newChunks, error: fetchError } = await supabase
    .from('document_chunks')
    .select('id, chunk_index, embedding_3076')
    .eq('document_id', newDocId)
    .order('chunk_index', { ascending: true });

  if (fetchError || !newChunks) {
    throw new Error(`Failed to fetch new chunks for drift computation: ${fetchError?.message}`);
  }

  // 2. Map each new chunk to its semantic nearest neighbor in the OLD document
  // Note: We use Promise.all for parallel RPC invocations to keep ingestion blazing fast.
  // If chunks exceed 50+, consider batching these to avoid connection pool exhaustion.
  const driftChecks = newChunks.map(async (newChunk) => {
    
    // Call the dual-rail RPC specifically constrained to the old document's ID
    const { data: matches, error: matchError } = await supabase.rpc('match_document_chunks_3076', {
      query_embedding: newChunk.embedding_3076,
      match_threshold: 0.0, // Set to 0 to guarantee we get the absolute closest neighbor, even if bad
      match_count: 1,
      filter_document_id: oldDocId
    });

    if (matchError) {
      console.error(`Error matching chunk ${newChunk.id}:`, matchError);
      return;
    }

    // 3. Evaluate the Drift
    if (!matches || matches.length === 0) {
      // No neighbor found at all (implies the old document had 0 chunks, edge case)
      driftedChunks.push({
        newChunkId: newChunk.id,
        newChunkIndex: newChunk.chunk_index,
        oldChunkId: null,
        oldChunkIndex: null,
        similarityScore: 0,
        reason: 'NET_NEW'
      });
    } else {
      const bestMatch = matches[0];
      
      // If the cosine similarity drops below our threshold, the narrative/facts changed
      if (bestMatch.similarity < driftThreshold) {
        driftedChunks.push({
          newChunkId: newChunk.id,
          newChunkIndex: newChunk.chunk_index,
          oldChunkId: bestMatch.id,
          oldChunkIndex: bestMatch.chunk_index,
          similarityScore: bestMatch.similarity,
          reason: 'MODIFIED'
        });
      }
    }
  });

  await Promise.all(driftChecks);

  // Return the isolated array of chunks that require deep LLM hydration and auditing
  return driftedChunks;
}
