-- ============================================================
-- Migration: 20260805000000_workspace_memories_pgvector.sql
-- Purpose: Add workspace-level memory table with pgvector support
--          for semantic retrieval in dynamic context assembly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workspace_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding_768 vector(768),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_memories_workspace_id
  ON public.workspace_memories(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_memories_created_at
  ON public.workspace_memories(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_memories_embedding_768_idx
  ON public.workspace_memories USING hnsw (embedding_768 vector_cosine_ops);

ALTER TABLE public.workspace_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view workspace memories"
  ON public.workspace_memories FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can insert workspace memories"
  ON public.workspace_memories FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can update workspace memories"
  ON public.workspace_memories FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace members can delete workspace memories"
  ON public.workspace_memories FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION match_workspace_memories (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_workspace_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE sql
AS $$
  SELECT
    wm.id,
    wm.content,
    wm.metadata,
    1 - (wm.embedding_768 <=> query_embedding) AS similarity,
    wm.created_at
  FROM public.workspace_memories wm
  WHERE
    wm.workspace_id = filter_workspace_id
    AND wm.embedding_768 IS NOT NULL
    AND 1 - (wm.embedding_768 <=> query_embedding) > match_threshold
  ORDER BY
    wm.embedding_768 <=> query_embedding,
    wm.created_at DESC
  LIMIT match_count;
$$;
