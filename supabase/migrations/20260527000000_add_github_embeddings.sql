-- Migration: Add GitHub Embeddings for RAG
-- Enables pgvector, creates github_embeddings table with hnsw index, and enforces RLS for tenant isolation.

-- Enable pgvector extension if not already active
CREATE EXTENSION IF NOT EXISTS vector;

-- Create github_embeddings table
CREATE TABLE IF NOT EXISTS public.github_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_chunk TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for semantic search speed using HNSW
CREATE INDEX IF NOT EXISTS github_embeddings_embedding_idx 
ON public.github_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE public.github_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read embeddings in their authorized workspaces
CREATE POLICY "Users can view embeddings in their workspaces"
ON public.github_embeddings
FOR SELECT
USING (
    workspace_id IN (
        SELECT id 
        FROM public.workspaces 
        WHERE user_id = auth.uid()::text
    )
);

-- Policy: Service role can manage embeddings
CREATE POLICY "Service role manages embeddings"
ON public.github_embeddings
FOR ALL
USING (auth.role() = 'service_role');
