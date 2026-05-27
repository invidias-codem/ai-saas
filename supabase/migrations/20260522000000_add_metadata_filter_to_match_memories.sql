-- ============================================================
-- Migration: 20260522000000_add_metadata_filter_to_match_memories.sql
-- Purpose: Add metadata JSONB filtering to match_memories_768 and match_memories_3072 to avoid client-side RAG filtering bottlenecks.
-- ============================================================

-- Drop old 5-parameter signatures to prevent resolution conflicts
DROP FUNCTION IF EXISTS public.match_memories_768(vector(768), float, int, text, text);
DROP FUNCTION IF EXISTS public.match_memories_3072(vector(3072), float, int, text, text);

-- Re-declare upgraded 6-parameter signatures with JSONB metadata_filter
CREATE OR REPLACE FUNCTION public.match_memories_768 (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id text,
  filter_feature_type text DEFAULT NULL,
  metadata_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  metadata jsonb,
  similarity float,
  created_at timestamptz,
  reward_score float
)
LANGUAGE sql
AS $$
  SELECT
    mb.id,
    mb.content,
    mb.type,
    mb.metadata,
    1 - (mb.embedding_768 <=> query_embedding) AS similarity,
    mb.updated_at AS created_at,
    mb.reward_score
  FROM public.memory_bank mb
  WHERE
    mb.user_id = filter_user_id
    AND mb.embedding_768 IS NOT NULL
    AND (
      filter_feature_type IS NULL
      OR mb.type = filter_feature_type
      OR mb.metadata->>'feature_type' = filter_feature_type
    )
    AND (
      metadata_filter = '{}'::jsonb
      OR mb.metadata @> metadata_filter
    )
    AND 1 - (mb.embedding_768 <=> query_embedding) > match_threshold
  ORDER BY
    mb.embedding_768 <=> query_embedding,
    mb.updated_at DESC
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_memories_3072 (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_user_id text,
  filter_feature_type text DEFAULT NULL,
  metadata_filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  metadata jsonb,
  similarity float,
  created_at timestamptz,
  reward_score float
)
LANGUAGE sql
AS $$
  SELECT
    mb.id,
    mb.content,
    mb.type,
    mb.metadata,
    1 - (mb.embedding_3072 <=> query_embedding) AS similarity,
    mb.updated_at AS created_at,
    mb.reward_score
  FROM public.memory_bank mb
  WHERE
    mb.user_id = filter_user_id
    AND mb.embedding_3072 IS NOT NULL
    AND (
      filter_feature_type IS NULL
      OR mb.type = filter_feature_type
      OR mb.metadata->>'feature_type' = filter_feature_type
    )
    AND (
      metadata_filter = '{}'::jsonb
      OR mb.metadata @> metadata_filter
    )
    AND 1 - (mb.embedding_3072 <=> query_embedding) > match_threshold
  ORDER BY
    mb.embedding_3072 <=> query_embedding,
    mb.updated_at DESC
  LIMIT match_count;
$$;
