-- ============================================================
-- Migration: 20260904000001_match_genotypes.sql
-- Purpose: Versioned vector-match RPC for EMSH genotypes — dual-rail
--          embedding recall. Matches the established match_*_v2 pattern
--          (cosine similarity via `1 - (embedding <=> query)`).
--
-- Dual-rail adapter note (see lib/emSh/genotypeStore.ts):
--   * Query vectors arrive as 3072-dim (Gemini); the write path projects them
--     to 768-dim via Matryoshka-style truncation before storage.
--   * This RPC expects BOTH the stored vector and the query vector to already
--     be 768-dim — callers MUST slice the query to (0,768) before invoking.
-- ============================================================

CREATE OR REPLACE FUNCTION match_genotypes (
  query_embedding vector(768),
  target_workspace_id uuid,
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  intent_signature text,
  fitness_score double precision,
  similarity float
) AS $$
  SELECT
    g.id,
    g.intent_signature,
    g.fitness_score,
    (1 - (g.intent_embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.genotypes g
  WHERE
    (target_workspace_id IS NULL OR g.workspace_id = target_workspace_id)
    AND g.intent_embedding IS NOT NULL
    AND (1 - (g.intent_embedding <=> query_embedding)) > match_threshold
  ORDER BY
    g.intent_embedding <=> query_embedding,
    g.fitness_score DESC
  LIMIT match_count;
$$ LANGUAGE sql SECURITY DEFINER;