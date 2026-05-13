-- ============================================================
-- Migration: 20260513090000_fix_match_memories_timestamps
-- Purpose:   Align memory retrieval RPCs with production memory_bank
--            timestamp reality (`updated_at` rather than `created_at`).
--
-- Background:
--   Production runtime logs showed:
--     column mb.created_at does not exist
--     hint: Perhaps you meant to reference the column "mb.updated_at".
--
--   The app already routes retrieval to match_memories_768 and
--   match_memories_3072, so both RPCs must order/project the timestamp field
--   that actually exists in production.
-- ============================================================

CREATE OR REPLACE FUNCTION match_memories_768 (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid,
  filter_feature_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE sql
AS $$
  SELECT
    mb.id,
    mb.content,
    mb.type,
    mb.metadata,
    1 - (mb.embedding_768 <=> query_embedding) AS similarity,
    mb.updated_at AS created_at
  FROM memory_bank mb
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

CREATE OR REPLACE FUNCTION match_memories_3072 (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_user_id uuid,
  filter_feature_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
LANGUAGE sql
AS $$
  SELECT
    mb.id,
    mb.content,
    mb.type,
    mb.metadata,
    1 - (mb.embedding_3072 <=> query_embedding) AS similarity,
    mb.updated_at AS created_at
  FROM memory_bank mb
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
