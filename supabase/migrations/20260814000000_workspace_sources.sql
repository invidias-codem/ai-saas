-- ============================================================
-- Migration: 20260814000000_workspace_sources.sql
-- Purpose: Source-agnostic knowledge substrate for the chameleon
--          consultant. Any user-supplied material (notes, pasted
--          text, URLs, PDFs, NotebookLM exports, later: refinery
--          feeds) is chunked, cleansed, embedded, and stored here
--          workspace-scoped, so Weaver can retrieve it during
--          inference regardless of where it came from.
--
-- Conventions matched to existing schema:
--   * workspaces.id        -> uuid PK (references public.workspaces(id))
--   * workspaces.user_id   -> Clerk text id (auth.uid()::text)
--   * embeddings           -> vector(1536) (text-embedding-3-small)
--   * HNSW + cosine ops    -> same as github_embeddings
--   * temporal columns     -> valid_from / valid_until for refresh
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.workspace_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       text NOT NULL,                 -- Clerk id of the ingesting user

  -- Where this knowledge came from. 'refinery' is reserved for the later
  -- shared/niche scraping feeds that plug into this same table.
  source_type   text NOT NULL DEFAULT 'note'
                CHECK (source_type IN (
                  'note',        -- freeform user notes
                  'paste',       -- pasted text block
                  'url',         -- scraped web page / pricing page / doc
                  'pdf',         -- uploaded document
                  'notebooklm',  -- NotebookLM (or similar) export
                  'github',      -- repo material (kept distinct from github_embeddings for unified retrieval)
                  'refinery'     -- shared background refinery feed
                )),

  title         text,                          -- human label / filename / page title
  origin_uri    text,                          -- URL, file name, or external id (nullable for notes)

  -- Provenance + freshness
  raw_text      text,                          -- untouched source payload
  content       text NOT NULL,                 -- cleansed, chunked text that was embedded
  embedding     vector(1536),                  -- nullable so raw can persist even if embed fails
  metadata      jsonb DEFAULT '{}'::jsonb,     -- chunk_index, char_range, extracted facts, source_confidence, etc.

  -- Temporal knowledge-graph columns (append-only refresh pattern):
  -- a newer row supersedes by setting valid_until on the old row.
  valid_from    timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz,                   -- NULL = currently authoritative

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Only currently-valid rows should be retrieved by default.
CREATE INDEX IF NOT EXISTS idx_workspace_sources_current
  ON public.workspace_sources(workspace_id)
  WHERE valid_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_sources_type
  ON public.workspace_sources(workspace_id, source_type);

CREATE INDEX IF NOT EXISTS idx_workspace_sources_created
  ON public.workspace_sources(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_sources_embedding_idx
  ON public.workspace_sources USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.workspace_sources ENABLE ROW LEVEL SECURITY;

-- Read: members of the workspace (matches github_embeddings convention)
CREATE POLICY "Users can view sources in their workspaces"
  ON public.workspace_sources FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()::text
    )
  );

-- Write: members of the workspace
CREATE POLICY "Users can insert sources in their workspaces"
  ON public.workspace_sources FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update sources in their workspaces"
  ON public.workspace_sources FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete sources in their workspaces"
  ON public.workspace_sources FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces WHERE user_id = auth.uid()::text
    )
  );

-- Service role full management (server-side ingest + refinery workers)
CREATE POLICY "Service role manages workspace sources"
  ON public.workspace_sources FOR ALL
  TO service_role
  USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- Retrieval RPC: semantic match over CURRENT (valid_until IS NULL)
-- sources for a workspace. Mirrors match_workspace_memories_v2 style
-- but scoped to the 1536-dim embeddings and source-agnostic rows.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_workspace_sources (
  query_embedding      vector(1536),
  target_workspace_id  uuid,
  match_threshold      float  DEFAULT 0.7,
  match_count          int    DEFAULT 12,
  filter_source_types  text[] DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  source_type text,
  title       text,
  origin_uri  text,
  content     text,
  metadata    jsonb,
  similarity  float,
  created_at  timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ws.id,
    ws.source_type,
    ws.title,
    ws.origin_uri,
    ws.content,
    ws.metadata,
    (1 - (ws.embedding <=> query_embedding))::FLOAT AS similarity,
    ws.created_at
  FROM public.workspace_sources ws
  WHERE ws.workspace_id = target_workspace_id
    AND ws.valid_until IS NULL
    AND ws.embedding IS NOT NULL
    AND (filter_source_types IS NULL OR ws.source_type = ANY(filter_source_types))
    AND (1 - (ws.embedding <=> query_embedding)) > match_threshold
  ORDER BY ws.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------
-- Refresh helper: mark all currently-valid rows for a given
-- (workspace_id, origin_uri) as superseded, so a re-ingest of the
-- same URL/document becomes an append-only new version.
-- Returns the number of rows closed out.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION supersede_workspace_source (
  target_workspace_id uuid,
  target_origin_uri   text,
  superseded_at       timestamptz DEFAULT now()
)
RETURNS int AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.workspace_sources
  SET valid_until = superseded_at,
      updated_at  = superseded_at
  WHERE workspace_id = target_workspace_id
    AND origin_uri   = target_origin_uri
    AND valid_until  IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
