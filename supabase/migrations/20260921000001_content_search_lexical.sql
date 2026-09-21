-- 20260921000001_content_search_lexical.sql
-- Plain-text shadow column + lexical retrieval for memory_bank (Phase P1).
--
-- memory_bank.content is LZ-compressed, so the existing FTS index over
-- `content` indexes compressed bytes (useless). This adds:
--   1. content_search — plain-text shadow column, kept in sync by the
--      application on insert/update (it decompresses what it writes).
--   2. GIN tsvector index over content_search (code_chunk partial, matching
--      the existing FTS index shape).
--   3. search_memories_lexical() — trigram/keyword retrieval used when the
--      embedding provider is degraded (zero-vector) — never calls pgvector.
--
-- Backfill: content_search is NULL for legacy rows until re-written by the
-- application; search_memories_lexical filters NULL, so those rows are
-- simply not yet lexically retrievable (progressive, same as re-embedding).

-- 1. Shadow column
ALTER TABLE public.memory_bank
  ADD COLUMN IF NOT EXISTS content_search text;

-- 2. Lexical index (partial, mirrors the compressed-content FTS index)
CREATE INDEX IF NOT EXISTS memory_bank_content_search_fts_idx
  ON public.memory_bank USING gin (to_tsvector('english', content_search))
  WHERE type = 'code_chunk';

-- 3. Lexical retrieval — degraded-mode fallback (no pgvector, no embeddings)
CREATE OR REPLACE FUNCTION public.search_memories_lexical(
  query_text text,
  match_count integer DEFAULT 5,
  filter_user_id text DEFAULT NULL,
  filter_feature_type text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  content text,
  type text,
  metadata jsonb,
  similarity double precision,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mb.id,
    mb.content, -- still compressed; application decompresses on read
    mb.type,
    mb.metadata,
    ts_rank(to_tsvector('english', mb.content_search), plainto_tsquery('english', query_text)) AS similarity,
    mb.created_at
  FROM public.memory_bank mb
  WHERE mb.content_search IS NOT NULL
    AND (filter_user_id IS NULL OR mb.user_id = filter_user_id)
    AND (filter_feature_type IS NULL OR mb.feature_type = filter_feature_type)
    AND to_tsvector('english', mb.content_search) @@ plainto_tsquery('english', query_text)
  ORDER BY similarity DESC, mb.created_at DESC
  LIMIT GREATEST(1, match_count);
$$;

-- RLS: the RPC is SECURITY DEFINER; keep the same read policy surface as
-- match_memories_* (policy refines, does not grant).
