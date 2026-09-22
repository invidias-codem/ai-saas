-- 20260921000001_content_search_lexical.sql
-- Plain-text shadow column + lexical retrieval for memory_bank.
--
-- memory_bank.content is LZ-compressed, so the existing FTS index over
-- `content` indexes compressed bytes (useless). This adds:
--   1. content_search — plain-text shadow column, kept in sync by the
--      application on insert/update (it decompresses what it writes).
--   2. Non-partial GIN index over content_search (qodo #4: a code_chunk-only
--      partial index cannot serve general degraded searches).
--   3. search_memories_lexical() — FTS retrieval used when the embedding
--      provider is degraded (zero-vector) — never calls pgvector.
--
-- Schema corrections (qodo #1/#2): production memory_bank has NO created_at /
-- feature_type columns (timestamps live in updated_at; feature type is the
-- `type` column or metadata->>'feature_type') and id is uuid. The RPC is
-- SECURITY INVOKER with a REQUIRED user filter and no PUBLIC execute grant —
-- a security-definer variant with a nullable user param would let any caller
-- read every user's memories.
--
-- Backfill: content_search is NULL for legacy rows until re-written by the
-- application; search_memories_lexical filters NULL, so those rows are
-- simply not yet lexically retrievable (progressive, same as re-embedding).

-- 1. Shadow column
ALTER TABLE public.memory_bank
  ADD COLUMN IF NOT EXISTS content_search text;

-- 2. Lexical index — non-partial: serves ALL degraded searches, not just
-- code_chunk rows (qodo #4). NULL rows are excluded by the query predicate.
CREATE INDEX IF NOT EXISTS memory_bank_content_search_fts_idx
  ON public.memory_bank USING gin (to_tsvector('english', content_search))
  WHERE content_search IS NOT NULL;

-- 3. Lexical retrieval — degraded-mode fallback (no pgvector, no embeddings).
--    SECURITY INVOKER: runs with the CALLER's privileges, so RLS policies on
--    memory_bank apply. filter_user_id is NOT NULL — there is no
--    "all users" mode. Feature-type matching mirrors match_memories_*:
--    mb.type or metadata->>'feature_type'.
CREATE OR REPLACE FUNCTION public.search_memories_lexical(
  query_text text,
  filter_user_id text,
  match_count integer DEFAULT 5,
  filter_feature_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  type text,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    mb.id,
    mb.content, -- still compressed; application decompresses on read
    mb.type,
    mb.metadata,
    ts_rank(to_tsvector('english', mb.content_search), plainto_tsquery('english', query_text))::double precision AS similarity,
    mb.updated_at AS created_at
  FROM public.memory_bank mb
  WHERE mb.content_search IS NOT NULL
    AND mb.user_id = filter_user_id
    AND (
      filter_feature_type IS NULL
      OR mb.type = filter_feature_type
      OR mb.metadata->>'feature_type' = filter_feature_type
    )
    AND to_tsvector('english', mb.content_search) @@ websearch_to_tsquery('english', query_text)
  ORDER BY similarity DESC, mb.updated_at DESC
  LIMIT GREATEST(1, match_count);
$$;

-- qodo #2: no PUBLIC execute. The app calls this via supabaseAdmin
-- (service_role), which bypasses RLS by definition; authenticated users have
-- no direct grant.
REVOKE EXECUTE ON FUNCTION public.search_memories_lexical(text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_memories_lexical(text, text, integer, text) TO service_role;
