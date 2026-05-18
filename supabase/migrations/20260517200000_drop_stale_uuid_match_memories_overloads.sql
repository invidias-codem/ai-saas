-- ============================================================
-- Migration: 20260517200000_drop_stale_uuid_match_memories_overloads
-- Purpose:   Remove stale uuid-typed overloads for memory retrieval RPCs.
--
-- Background:
--   Production logs showed PostgREST ambiguity:
--     PGRST203 Could not choose between text and uuid versions of
--     public.match_memories_3072(... filter_user_id ...)
--
--   The active application contract uses TEXT because memory_bank.user_id is
--   stored as text. The stale UUID overloads must be removed so PostgREST can
--   resolve the RPC deterministically.
-- ============================================================

DROP FUNCTION IF EXISTS public.match_memories_768(vector(768), float, int, uuid, text);
DROP FUNCTION IF EXISTS public.match_memories_3072(vector(3072), float, int, uuid, text);

-- Reassert the intended text-based signatures after removing the stale overloads.
CREATE OR REPLACE FUNCTION public.match_memories_768 (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id text,
  filter_feature_type text DEFAULT NULL
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
  filter_feature_type text DEFAULT NULL
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
    AND 1 - (mb.embedding_3072 <=> query_embedding) > match_threshold
  ORDER BY
    mb.embedding_3072 <=> query_embedding,
    mb.updated_at DESC
  LIMIT match_count;
$$;
