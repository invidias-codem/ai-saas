-- 1. Create the private bucket for archived documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('archived_documents', 'archived_documents', false)
ON CONFLICT (id) DO NOTHING;

-- Note: Access to this bucket is strictly through the backend API using the 
-- service-role key (supabaseAdmin), so we do not need to add public RLS policies.

-- 2. Create the atomic commit RPC for the Archival Engine
CREATE OR REPLACE FUNCTION commit_document_archival(
    p_document_id UUID,
    p_storage_uri TEXT
) RETURNS VOID AS $$
BEGIN
    -- 1. Update the parent metadata
    UPDATE workspace_documents 
    SET storage_state = 'COLD',
        storage_uri = p_storage_uri,
        content_raw = NULL,
        updated_at = NOW()
    WHERE id = p_document_id;

    -- 2. Strip the text from chunks but preserve the high-res vectors
    UPDATE document_chunks 
    SET content = NULL
    WHERE document_id = p_document_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Update dual-rail RPCs to support COLD state and return storage metadata
CREATE OR REPLACE FUNCTION match_document_chunks_768 (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_workspace_id uuid,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  storage_state storage_state_enum,
  storage_uri text
)
LANGUAGE sql STABLE
AS $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding_768 <=> query_embedding) as similarity,
    workspace_documents.storage_state,
    workspace_documents.storage_uri
  from document_chunks
  join workspace_documents on workspace_documents.id = document_chunks.document_id
  where workspace_documents.workspace_id = filter_workspace_id
    and (filter_document_ids IS NULL OR document_chunks.document_id = ANY(filter_document_ids))
    and 1 - (document_chunks.embedding_768 <=> query_embedding) > match_threshold
  order by document_chunks.embedding_768 <=> query_embedding
  limit match_count;
$$;

CREATE OR REPLACE FUNCTION match_document_chunks_3076 (
  query_embedding vector(3076),
  match_threshold float,
  match_count int,
  filter_workspace_id uuid,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  storage_state storage_state_enum,
  storage_uri text
)
LANGUAGE sql STABLE
AS $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding_3076 <=> query_embedding) as similarity,
    workspace_documents.storage_state,
    workspace_documents.storage_uri
  from document_chunks
  join workspace_documents on workspace_documents.id = document_chunks.document_id
  where workspace_documents.workspace_id = filter_workspace_id
    and (filter_document_ids IS NULL OR document_chunks.document_id = ANY(filter_document_ids))
    and 1 - (document_chunks.embedding_3076 <=> query_embedding) > match_threshold
  order by document_chunks.embedding_3076 <=> query_embedding
  limit match_count;
$$;
