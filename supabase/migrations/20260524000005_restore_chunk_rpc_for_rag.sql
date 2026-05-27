-- ============================================================
-- Restore chat-RAG-compatible match_document_chunks_3076
-- and give the delta/diff engine its own dedicated function.
--
-- Root cause: migration 000003 overwrote the chat RAG RPC with
-- a different signature (singular filter_document_id, extra
-- chunk_index column) needed by vectorDiff.ts. This broke the
-- 3076-rail retrieval path in contextAggregator.ts.
-- ============================================================

-- Step 1: Drop the delta-specialised version that 000003 installed
DROP FUNCTION IF EXISTS match_document_chunks_3076(vector(3076), float, int, uuid);

-- Step 2: Create a dedicated delta-diff function (used by vectorDiff.ts)
CREATE OR REPLACE FUNCTION match_document_chunks_3076_delta (
  query_embedding  vector(3076),
  match_threshold  float,
  match_count      int,
  filter_document_id uuid
)
RETURNS TABLE (
  id            uuid,
  document_id   uuid,
  chunk_index   int,
  content       text,
  similarity    float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.chunk_index,
    document_chunks.content,
    1 - (document_chunks.embedding_3076 <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE document_chunks.document_id = filter_document_id
    AND 1 - (document_chunks.embedding_3076 <=> query_embedding) >= match_threshold
  ORDER BY document_chunks.embedding_3076 <=> query_embedding
  LIMIT match_count;
$$;

-- Step 3: Restore the chat-RAG-compatible match_document_chunks_3076
-- Signature matches what contextAggregator.ts expects:
--   filter_workspace_id (nullable), filter_document_ids (uuid array, nullable)
-- Returns storage_state + storage_uri so contextAggregator can hydrate COLD docs.
CREATE OR REPLACE FUNCTION match_document_chunks_3076 (
  query_embedding      vector(3076),
  match_threshold      float,
  match_count          int,
  filter_workspace_id  uuid        DEFAULT NULL,
  filter_document_ids  uuid[]      DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  document_id   uuid,
  content       text,
  similarity    float,
  storage_state storage_state_enum,
  storage_uri   text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding_3076 <=> query_embedding) AS similarity,
    wd.storage_state,
    wd.storage_uri
  FROM document_chunks dc
  JOIN workspace_documents wd ON wd.id = dc.document_id
  WHERE
    -- Workspace filter: skip clause entirely when NULL (personal docs rely on document_id scoping)
    (filter_workspace_id IS NULL OR wd.workspace_id = filter_workspace_id)
    -- Document ID allow-list: skip clause when NULL (retrieve across all workspace docs)
    AND (filter_document_ids IS NULL OR dc.document_id = ANY(filter_document_ids))
    AND 1 - (dc.embedding_3076 <=> query_embedding) > match_threshold
  ORDER BY dc.embedding_3076 <=> query_embedding
  LIMIT match_count;
$$;
