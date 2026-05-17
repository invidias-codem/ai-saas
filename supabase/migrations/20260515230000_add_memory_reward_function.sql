-- ============================================================
-- Migration: 20260515230000_add_memory_reward_function
-- Purpose:   Add reward_score and last_accessed_at to memory_bank
--            for Anti-Addiction & High-Utility Routing Architecture.
-- Drop existing functions first since return type is changing.
-- ============================================================

ALTER TABLE public.memory_bank
ADD COLUMN IF NOT EXISTS reward_score FLOAT DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_memory_bank_reward_score ON public.memory_bank(reward_score);
CREATE INDEX IF NOT EXISTS idx_memory_bank_last_accessed_at ON public.memory_bank(last_accessed_at);

-- Drop existing versions so we can change the return type
DROP FUNCTION IF EXISTS match_memories_768(vector, double precision, integer, text, text);
DROP FUNCTION IF EXISTS match_memories_3072(vector, double precision, integer, text, text);

-- Also drop the overloaded match_memories wrapper that calls match_memories_768
DROP FUNCTION IF EXISTS match_memories(vector, double precision, integer, text, text);

-- Recreate match_memories_768 with reward_score in return type
-- NOTE: filter_user_id is text (not uuid) to match memory_bank.user_id column type
CREATE OR REPLACE FUNCTION match_memories_768 (
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

-- Recreate match_memories_3072 with reward_score in return type
-- NOTE: filter_user_id is text (not uuid) to match memory_bank.user_id column type
CREATE OR REPLACE FUNCTION match_memories_3072 (
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

-- Restore the match_memories wrapper (now returns reward_score too)
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding vector,
  match_threshold double precision,
  match_count integer,
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
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.match_memories_768(
    query_embedding,
    match_threshold,
    match_count,
    filter_user_id,
    filter_feature_type
  );
END;
$$;
