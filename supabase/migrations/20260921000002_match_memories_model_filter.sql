-- 20260921000002_match_memories_model_filter.sql
-- Model-aware retrieval: gemini-embedding-2 (GA) vectors are NOT guaranteed
-- to share a vector space with the retired gemini-embedding-2-preview.
-- Adds an optional 7th parameter (DEFAULT NULL → old behavior) so callers can
-- scope retrieval to rows embedded by the current model. Re-embedding of
-- legacy rows is progressive (backfill script), so rows with NULL/legacy
-- embedding_model simply don't match a model-filtered query until re-embedded.

DROP FUNCTION IF EXISTS match_memories_3072(vector(3072), double precision, integer, text, text, jsonb);

CREATE OR REPLACE FUNCTION match_memories_3072 (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_user_id text,
  filter_feature_type text DEFAULT NULL,
  metadata_filter jsonb DEFAULT '{}'::jsonb,
  filter_embedding_model text DEFAULT NULL
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
STABLE
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
  WHERE mb.user_id = filter_user_id
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
    AND (
      filter_embedding_model IS NULL
      OR mb.embedding_model = filter_embedding_model
    )
    AND 1 - (mb.embedding_3072 <=> query_embedding) > match_threshold
  ORDER BY
    mb.embedding_3072 <=> query_embedding,
    mb.updated_at DESC
  LIMIT match_count;
$$;
