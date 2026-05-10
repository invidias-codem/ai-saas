-- ============================================================
-- Knowledge Graph Base Tables — PREREQUISITE
-- Tech Genie / UCOL Architecture
-- Date: 2026-03-04
-- Run this FIRST, before world_model_schema.sql
--
-- Creates the base knowledge_nodes and knowledge_edges tables
-- that the world model schema extends via ALTER TABLE.
-- ============================================================

-- ─────────────────────────────────────────────
-- Enable pgvector if not already enabled
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- knowledge_nodes — Core graph entity table
-- Each node = a concept, fact, entity, or claim
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT,                        -- clerk user_id (null = global/shared)
  content         TEXT        NOT NULL,        -- the raw text of this node
  canonical_name  TEXT,                        -- normalized name for dedup
  node_type       TEXT        NOT NULL DEFAULT 'concept'
                              CHECK (node_type IN (
                                'person', 'organization', 'product',
                                'concept', 'event', 'claim', 'metric', 'document'
                              )),
  aliases         TEXT[]      NOT NULL DEFAULT '{}',
  metadata        JSONB       NOT NULL DEFAULT '{}',  -- domain, tags, custom attrs
  embedding       VECTOR(1536),                -- Gemini embedding-001
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_knowledge_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_nodes_updated_at ON knowledge_nodes;
CREATE TRIGGER trg_knowledge_nodes_updated_at
  BEFORE UPDATE ON knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_nodes_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_user_id
  ON knowledge_nodes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type
  ON knowledge_nodes (node_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_canonical
  ON knowledge_nodes (canonical_name)
  WHERE canonical_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_metadata_domain
  ON knowledge_nodes ((metadata->>'domain'))
  WHERE metadata->>'domain' IS NOT NULL;

-- Vector similarity index (cosine distance — best for embeddings)
CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_embedding
  ON knowledge_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─────────────────────────────────────────────
-- knowledge_edges — Relationships between nodes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID        NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_id       UUID        NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  weight          FLOAT       NOT NULL DEFAULT 1.0
                              CHECK (weight BETWEEN 0.0 AND 10.0),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate edges between the same pair of nodes
  CONSTRAINT unique_edge UNIQUE (source_id, target_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_knowledge_edges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_knowledge_edges_updated_at ON knowledge_edges;
CREATE TRIGGER trg_knowledge_edges_updated_at
  BEFORE UPDATE ON knowledge_edges
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_edges_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_source
  ON knowledge_edges (source_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_target
  ON knowledge_edges (target_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_weight
  ON knowledge_edges (weight DESC);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_edges ENABLE ROW LEVEL SECURITY;

-- Service role has full access (server-side only writes)
-- Authenticated users can read their own nodes + global nodes
CREATE POLICY "knowledge_nodes_select" ON knowledge_nodes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR user_id IS NULL);

CREATE POLICY "knowledge_nodes_insert" ON knowledge_nodes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text OR user_id IS NULL);

-- Edges: accessible if either endpoint is accessible to the user
CREATE POLICY "knowledge_edges_select" ON knowledge_edges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_nodes n
      WHERE n.id = source_id
        AND (n.user_id = auth.uid()::text OR n.user_id IS NULL)
    )
  );

-- ─────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────
COMMENT ON TABLE knowledge_nodes IS
  'Core knowledge graph nodes. Each row = a concept, fact, entity, or claim extracted from conversations or external sources.';

COMMENT ON TABLE knowledge_edges IS
  'Relationships between knowledge nodes. Extended by world_model_schema.sql with causal typing and temporal metadata.';

COMMENT ON COLUMN knowledge_nodes.embedding IS
  'Gemini embedding-001 vector (1536d) for semantic similarity search.';

COMMENT ON COLUMN knowledge_nodes.metadata IS
  'Flexible JSONB bag: domain, tags, source, subdomain. Indexed on metadata->>domain for distribution shift queries.';
