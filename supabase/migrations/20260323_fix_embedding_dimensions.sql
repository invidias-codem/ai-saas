-- ============================================================
-- Migration: 20260323_fix_embedding_dimensions
-- Purpose:   Fix all VECTOR(1536) columns to VECTOR(768) to
--            match the actual embedding model output dimension.
--
-- Background:
--   The original schema was scaffolded with VECTOR(1536) (matching
--   OpenAI ada-002), but the codebase has always used Gemini
--   embedding-001 which outputs 768-dim vectors. This caused silent
--   failures in vector similarity search on graph_nodes.
--
--   With the GCP billing shutdown (2026-03-23), we are migrating
--   to Lambda Labs Ollama (nomic-embed-text, 768-dim).
--   This migration corrects the schema to match reality.
--
-- Tables affected:
--   - graph_nodes          (embedding VECTOR(1536) → VECTOR(768))
--   - knowledge_nodes      (embedding VECTOR(1536) → VECTOR(768))
--   - delta_claims         (claim_embedding VECTOR(1536) → VECTOR(768))
--   - world_model_claims   (claim_embedding VECTOR(1536) → VECTOR(768))
--
-- RPCs updated:
--   - match_wm_nodes       (query_embedding vector(1536) → vector(768))
-- ============================================================

-- ── 1. graph_nodes ──────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'graph_nodes'
      AND column_name = 'embedding'
  ) THEN
    -- Drop dependent index first
    DROP INDEX IF EXISTS idx_knowledge_nodes_embedding;
    DROP INDEX IF EXISTS idx_graph_nodes_embedding;

    -- Alter column (existing data will be NULL-ed or cast; vector dims can't be cast, so we wipe)
    ALTER TABLE graph_nodes ALTER COLUMN embedding TYPE vector(768) USING NULL;

    COMMENT ON COLUMN graph_nodes.embedding IS
      'nomic-embed-text vector (768-dim) for semantic similarity search. Migrated from Gemini 1536-dim 2026-03-23.';

    -- Recreate index
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_embedding
      ON graph_nodes USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- ── 2. knowledge_nodes (alias / alternate table name) ───────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'knowledge_nodes'
      AND column_name = 'embedding'
  ) THEN
    DROP INDEX IF EXISTS idx_knowledge_nodes_embedding;

    ALTER TABLE knowledge_nodes ALTER COLUMN embedding TYPE vector(768) USING NULL;

    COMMENT ON COLUMN knowledge_nodes.embedding IS
      'nomic-embed-text vector (768-dim). Migrated from Gemini 1536-dim 2026-03-23.';

    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_embedding
      ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- ── 3. delta_claims (delta engine schema) ───────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delta_claims'
      AND column_name = 'claim_embedding'
  ) THEN
    DROP INDEX IF EXISTS idx_delta_claims_embedding;

    ALTER TABLE delta_claims ALTER COLUMN claim_embedding TYPE vector(768) USING NULL;

    CREATE INDEX IF NOT EXISTS idx_delta_claims_embedding
      ON delta_claims USING ivfflat (claim_embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- ── 4. world_model_claims ────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'world_model_claims'
      AND column_name = 'claim_embedding'
  ) THEN
    DROP INDEX IF EXISTS idx_wm_claims_embedding;

    ALTER TABLE world_model_claims ALTER COLUMN claim_embedding TYPE vector(768) USING NULL;

    CREATE INDEX IF NOT EXISTS idx_wm_claims_embedding
      ON world_model_claims USING ivfflat (claim_embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- ── 5. Rewrite match_wm_nodes RPC ───────────────────────────

CREATE OR REPLACE FUNCTION match_wm_nodes (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  similarity float,
  trust_tier trust_tier
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wn.id,
    wn.name,
    wn.type,
    wn.description,
    1 - (wn.embedding <=> query_embedding) AS similarity,
    wn.trust_tier
  FROM wm_current_entities wn
  WHERE
    wn.user_id = p_user_id
    AND wn.embedding IS NOT NULL
    AND 1 - (wn.embedding <=> query_embedding) > match_threshold
  ORDER BY wn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── Done ─────────────────────────────────────────────────────
-- Note: Existing embeddings stored under VECTOR(1536) are wiped (USING NULL).
-- They will be lazily re-embedded the next time those records are accessed
-- via storeMemory / upsertGraphNode. No manual backfill is required.
