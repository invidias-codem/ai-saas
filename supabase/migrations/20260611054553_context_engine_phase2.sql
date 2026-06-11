-- ============================================================================
-- Migration: 20260611054553_context_engine_phase2.sql
-- Lattice OS — Context Engine Phase 2
--
-- Creates:
--   1. github_oauth_states    — CSRF state tokens for the App install flow
--   2. github_installations   — Maps GitHub App installation_id → Clerk user_id
--   3. github_repo_syncs      — Durable sync job status (updated by Inngest)
--   4. code_fts GIN index     — Full-text search on memory_bank code chunks
--   5. search_code_rrf()      — Reciprocal Rank Fusion hybrid retrieval function
-- ============================================================================

-- ── Table: github_oauth_states ───────────────────────────────────────────────
-- Stores one-time CSRF state tokens generated in /api/github/app/install.
-- Consumed and deleted in /api/github/app/callback.

CREATE TABLE IF NOT EXISTS github_oauth_states (
  user_id    text        NOT NULL PRIMARY KEY,
  state      text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE github_oauth_states ENABLE ROW LEVEL SECURITY;

-- Service-role bypass only (install/callback routes use supabaseAdmin)
CREATE POLICY "service_role_only" ON github_oauth_states
  USING (false)
  WITH CHECK (false);


-- ── Table: github_installations ──────────────────────────────────────────────
-- Maps GitHub App installation_id to a Clerk user_id.
-- One row per installation; a user may install the App once per account.

CREATE TABLE IF NOT EXISTS github_installations (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         text        NOT NULL,
  installation_id bigint      NOT NULL UNIQUE,
  owner           text        NOT NULL,
  repos           text[]      NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS github_installations_user_id_idx
  ON github_installations (user_id);

ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;

-- Users can read their own installations (for the UI to show connected repos)
CREATE POLICY "users_read_own_installations" ON github_installations
  FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

-- Only service role can write (install/callback routes use supabaseAdmin)
CREATE POLICY "service_role_write_installations" ON github_installations
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── Table: github_repo_syncs ─────────────────────────────────────────────────
-- One row per (user_id, repo) pair. Updated by the Inngest github-repo-sync
-- function to reflect current sync status. Used by the UI to show progress.

CREATE TABLE IF NOT EXISTS github_repo_syncs (
  id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        text        NOT NULL,
  repo           text        NOT NULL,   -- "owner/repo"
  status         text        NOT NULL DEFAULT 'pending',  -- pending|running|complete|failed
  inngest_run_id text,
  files_indexed  int         NOT NULL DEFAULT 0,
  last_commit    text,
  synced_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS github_repo_syncs_user_repo_idx
  ON github_repo_syncs (user_id, repo);

CREATE INDEX IF NOT EXISTS github_repo_syncs_user_id_idx
  ON github_repo_syncs (user_id);

ALTER TABLE github_repo_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_syncs" ON github_repo_syncs
  FOR SELECT
  USING (user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));

CREATE POLICY "service_role_write_syncs" ON github_repo_syncs
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── GIN Index: Full-text search on code chunks ───────────────────────────────
-- Enables websearch_to_tsquery keyword search in the RRF function below.
-- Partial index filtered to code_chunk type keeps the index compact.
--
-- NOTE: memory_bank.content is stored compressed (lz-string). The FTS index
-- will be over the compressed content; for best results the application layer
-- should decompress before searching, or store a plain-text shadow column.
-- For now, the index is created so the infrastructure is ready; the RRF
-- function degrades gracefully if FTS ranks are zero.

CREATE INDEX IF NOT EXISTS memory_bank_code_fts_idx
  ON memory_bank USING gin (to_tsvector('english', content))
  WHERE type = 'code_chunk';


-- ── Function: search_code_rrf ────────────────────────────────────────────────
-- Hybrid Reciprocal Rank Fusion retrieval for code chunks.
--
-- Math:
--   RRF_score(d) = 1/(k + rank_vector) + 1/(k + rank_keyword)
--   where k = 60 (standard value from the original RRF paper)
--
-- Vector lane  : cosine similarity via existing match_memories_768 logic
-- Keyword lane : ts_rank_cd on to_tsvector('english', content)
--
-- Parameters:
--   p_user_id        Clerk user_id (RLS-equivalent filter — no actual RLS enforced here)
--   p_query_text     Raw query string used for both embedding lookup and FTS
--   p_query_embedding The embedding vector for the query (768-dim, generated by caller)
--   p_match_count    Number of final fused results to return (default 10)
--   p_k              RRF k constant (default 60)
--   p_repo_filter    Optional "owner/repo" to scope results (NULL = all repos)

CREATE OR REPLACE FUNCTION search_code_rrf(
  p_user_id        text,
  p_query_text     text,
  p_query_embedding vector(768),
  p_match_count    int     DEFAULT 10,
  p_k              int     DEFAULT 60,
  p_repo_filter    text    DEFAULT NULL
)
RETURNS TABLE (
  id         uuid,
  content    text,
  metadata   jsonb,
  rrf_score  float8,
  vec_rank   bigint,
  kw_rank    bigint
)
LANGUAGE sql STABLE
AS $$
  WITH

  -- Vector similarity lane: rank by cosine distance (lower = closer)
  vector_ranked AS (
    SELECT
      mb.id,
      mb.content,
      mb.metadata,
      ROW_NUMBER() OVER (ORDER BY mb.embedding <=> p_query_embedding ASC) AS vec_rank
    FROM memory_bank mb
    WHERE
      mb.user_id = p_user_id
      AND mb.type = 'code_chunk'
      AND mb.embedding IS NOT NULL
      AND (p_repo_filter IS NULL OR mb.metadata->>'repo' = p_repo_filter)
    LIMIT p_match_count * 4   -- over-fetch to give RRF enough candidates
  ),

  -- Full-text keyword lane: rank by ts_rank_cd
  keyword_ranked AS (
    SELECT
      mb.id,
      mb.content,
      mb.metadata,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(
          to_tsvector('english', mb.content),
          websearch_to_tsquery('english', p_query_text)
        ) DESC
      ) AS kw_rank
    FROM memory_bank mb
    WHERE
      mb.user_id = p_user_id
      AND mb.type = 'code_chunk'
      AND (p_repo_filter IS NULL OR mb.metadata->>'repo' = p_repo_filter)
      AND to_tsvector('english', mb.content) @@ websearch_to_tsquery('english', p_query_text)
    LIMIT p_match_count * 4
  ),

  -- Fuse both lanes using RRF
  fused AS (
    SELECT
      COALESCE(v.id, k.id)           AS id,
      COALESCE(v.content, k.content) AS content,
      COALESCE(v.metadata, k.metadata) AS metadata,
      -- RRF formula: sum of reciprocal ranks across lanes
      COALESCE(1.0 / (p_k + v.vec_rank), 0)
        + COALESCE(1.0 / (p_k + k.kw_rank), 0) AS rrf_score,
      COALESCE(v.vec_rank, (p_match_count * 4 + 1)::bigint) AS vec_rank,
      COALESCE(k.kw_rank, (p_match_count * 4 + 1)::bigint) AS kw_rank
    FROM vector_ranked  v
    FULL OUTER JOIN keyword_ranked k ON v.id = k.id
  )

  SELECT id, content, metadata, rrf_score, vec_rank, kw_rank
  FROM fused
  ORDER BY rrf_score DESC
  LIMIT p_match_count;
$$;

-- Grant execute to the anon and authenticated roles so client-side Supabase
-- SDK calls can invoke this RPC (subject to RLS on memory_bank).
GRANT EXECUTE ON FUNCTION search_code_rrf TO anon, authenticated;

-- ── Done ─────────────────────────────────────────────────────────────────────
COMMENT ON TABLE github_installations IS
  'Maps GitHub App installation_id to Clerk user_id for per-user token minting.';

COMMENT ON TABLE github_repo_syncs IS
  'Tracks Inngest-driven sync job status per (user, repo). Updated by github-repo-sync function.';

COMMENT ON FUNCTION search_code_rrf IS
  'Hybrid Reciprocal Rank Fusion retrieval combining vector cosine similarity with full-text keyword search for code chunks in memory_bank.';
