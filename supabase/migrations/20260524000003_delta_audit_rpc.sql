-- Modifies the match_document_chunks_3076 RPC to return chunk_index and allow COLD states
-- This is critical for the Vector Diff Engine to perform Nearest Neighbor Mapping against archived documents.

DROP FUNCTION IF EXISTS match_document_chunks_3076(vector(3076), float, int, uuid, uuid[]);

CREATE OR REPLACE FUNCTION match_document_chunks_3076 (
  query_embedding vector(3076),
  match_threshold float,
  match_count int,
  filter_document_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.chunk_index,
    document_chunks.content,
    1 - (document_chunks.embedding_3076 <=> query_embedding) as similarity
  from document_chunks
  where document_chunks.document_id = filter_document_id
    and 1 - (document_chunks.embedding_3076 <=> query_embedding) >= match_threshold
  order by document_chunks.embedding_3076 <=> query_embedding
  limit match_count;
$$;
