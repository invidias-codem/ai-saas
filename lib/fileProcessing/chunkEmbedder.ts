// lib/fileProcessing/chunkEmbedder.ts
// Segments extracted PDF text into chunks, generates embeddings, and stores them
// in the document_chunks table for RAG retrieval on follow-up turns.

import { supabase } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

const CHUNK_SIZE = 1500; // ~500 words
const CHUNK_OVERLAP = 300; // 20% overlap to prevent boundary splits

export interface ChunkEmbeddingResult {
  chunkCount: number;
  success: boolean;
  error?: string;
}

/**
 * Split text into overlapping chunks with sentence-boundary awareness.
 */
function segmentText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);

    // Try to break at a sentence boundary
    if (end < text.length) {
      const sentenceEnd = text.lastIndexOf('. ', end);
      if (sentenceEnd > start + CHUNK_SIZE * 0.5) {
        end = sentenceEnd + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    start = end - CHUNK_OVERLAP;
  }

  return chunks;
}

/**
 * Store PDF text as embedded chunks for RAG retrieval.
 * Call this asynchronously (fire-and-forget) to avoid blocking Turn 1 response.
 */
export async function storePdfChunks(
  documentId: string,
  extractedText: string
): Promise<ChunkEmbeddingResult> {
  try {
    // Segment the text
    const chunks = segmentText(extractedText);
    if (chunks.length === 0) {
      return { chunkCount: 0, success: false, error: 'No chunks generated' };
    }

    console.log(`[ChunkEmbedder] Segmenting ${extractedText.length} chars into ${chunks.length} chunks`);

    // Generate embeddings with concurrency control (max 5 parallel)
    const embeddingResults: Array<{ content: string; embedding: number[] | null }> = [];
    
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(async (chunk) => {
          try {
            const result = await generateEmbeddingWithMetadata(chunk);
            return { content: chunk, embedding: result.dimension === 768 ? result.vector : null };
          } catch {
            return { content: chunk, embedding: null };
          }
        })
      );
      embeddingResults.push(...results);
    }

    // Insert chunks with embeddings
    const insertPayload = embeddingResults.map((r, idx) => ({
      document_id: documentId,
      chunk_index: idx,
      content: r.content,
      embedding_768: r.embedding,
    }));

    const { error } = await supabase.from('document_chunks').insert(insertPayload);

    if (error) {
      console.error('[ChunkEmbedder] Failed to store chunks:', error);
      return { chunkCount: 0, success: false, error: error.message };
    }

    console.log(`[ChunkEmbedder] Stored ${chunks.length} chunks for document ${documentId}`);
    return { chunkCount: chunks.length, success: true };
  } catch (err: any) {
    console.error('[ChunkEmbedder] Unexpected error:', err);
    return { chunkCount: 0, success: false, error: err.message };
  }
}

/**
 * Retrieve relevant chunks for a user's query using semantic search.
 * Called on follow-up turns to inject only the most relevant context.
 */
export async function retrieveRelevantChunks(
  workspaceId: string,
  query: string,
  documentIds: string[] | null,
  matchCount = 3
): Promise<string> {
  try {
    const queryEmbedding = await generateEmbeddingWithMetadata(query);
    if (queryEmbedding.dimension !== 768) {
      console.warn('[ChunkEmbedder] Skipping retrieval: embedding dimension mismatch');
      return '';
    }

    const { data, error } = await supabase.rpc('match_document_chunks_768', {
      query_embedding: queryEmbedding.vector,
      match_threshold: 0.7,
      match_count: matchCount,
      filter_workspace_id: workspaceId,
      filter_document_ids: documentIds,
    });

    if (error || !data || data.length === 0) {
      return '';
    }

    // Format chunks for injection
    const formatted = data
      .map((chunk: any, idx: number) => `[Relevant Passage ${idx + 1}]\n${chunk.content}`)
      .join('\n\n');

    return `[Document Context]\n${formatted}\n[End of Document Context]`;
  } catch (err) {
    console.error('[ChunkEmbedder] Retrieval failed:', err);
    return '';
  }
}
