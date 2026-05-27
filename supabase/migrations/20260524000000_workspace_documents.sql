-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE storage_state_enum AS ENUM ('WARM', 'COMPRESSING', 'COLD');
CREATE TYPE embedding_tier_enum AS ENUM ('STANDARD_768', 'HIGH_RES_3076');

CREATE TABLE workspace_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_uri TEXT,
    storage_state storage_state_enum DEFAULT 'WARM',
    content_raw TEXT,
    embedding_tier embedding_tier_enum NOT NULL, -- Tracks which rail was used
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES workspace_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT, -- Must be nullable to support Phase 2 Cold Storage!
    embedding_768 VECTOR(768),
    embedding_3076 VECTOR(3076),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW Indexes for blazing fast similarity search on both rails
CREATE INDEX document_chunks_embedding_768_idx ON document_chunks USING hnsw (embedding_768 vector_cosine_ops);
-- Note: pgvector HNSW limits to 2000 dimensions. 3076 will rely on exact KNN or halfvec if upgraded.
-- CREATE INDEX document_chunks_embedding_3076_idx ON document_chunks USING hnsw (embedding_3076 vector_cosine_ops);

-- RPC functions for dual-rail retrieval targeting WARM and COMPRESSING states
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
  similarity float
)
LANGUAGE sql STABLE
AS $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding_768 <=> query_embedding) as similarity
  from document_chunks
  join workspace_documents on workspace_documents.id = document_chunks.document_id
  where workspace_documents.workspace_id = filter_workspace_id
    and workspace_documents.storage_state IN ('WARM', 'COMPRESSING')
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
  similarity float
)
LANGUAGE sql STABLE
AS $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding_3076 <=> query_embedding) as similarity
  from document_chunks
  join workspace_documents on workspace_documents.id = document_chunks.document_id
  where workspace_documents.workspace_id = filter_workspace_id
    and workspace_documents.storage_state IN ('WARM', 'COMPRESSING')
    and (filter_document_ids IS NULL OR document_chunks.document_id = ANY(filter_document_ids))
    and 1 - (document_chunks.embedding_3076 <=> query_embedding) > match_threshold
  order by document_chunks.embedding_3076 <=> query_embedding
  limit match_count;
$$;
