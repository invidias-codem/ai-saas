-- ============================================================
-- World Model Schema — Phase 1 & 2
-- Tech Genie / UCOL Architecture
-- Date: 2026-03-04
-- See: research/world-model/ARCHITECTURE.md
-- ============================================================

-- ============================================================
-- PHASE 1: Temporal World State Graph
-- Upgrade knowledge_nodes and knowledge_edges with temporal
-- and provenance metadata so the graph becomes a timeline,
-- not just a snapshot. This is the foundation for object
-- permanence — entities persist across sessions with history.
-- ============================================================

-- Temporal + provenance columns on knowledge_nodes
ALTER TABLE knowledge_nodes
  ADD COLUMN IF NOT EXISTS valid_from      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence      FLOAT       DEFAULT 1.0
                                           CHECK (confidence BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS source_type     TEXT
                                           CHECK (source_type IN (
                                             'user', 'verified', 'inferred',
                                             'external', 'system'
                                           )),
  ADD COLUMN IF NOT EXISTS source_url      TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by   UUID        REFERENCES knowledge_nodes(id);

-- Temporal + causal columns on knowledge_edges
ALTER TABLE knowledge_edges
  ADD COLUMN IF NOT EXISTS relationship_type TEXT NOT NULL DEFAULT 'RELATES_TO'
                                              CHECK (relationship_type IN (
                                                'RELATES_TO',
                                                'CORRELATES_WITH',
                                                'PRECEDES',
                                                'CAUSES',
                                                'INHIBITS',
                                                'CONTRADICTS',
                                                'SUPPORTS',
                                                'COUNTERFACTUAL_OF',
                                                'IS_A',
                                                'HAS_ATTRIBUTE',
                                                'ASSERTED_BY',
                                                'CONTEXT_OF',
                                                'SUPERSEDES'
                                              )),
  ADD COLUMN IF NOT EXISTS valid_from        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence        FLOAT       DEFAULT 1.0
                                             CHECK (confidence BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS causal_strength   FLOAT
                                             CHECK (causal_strength BETWEEN 0.0 AND 1.0);

-- Point-in-time world state snapshots
-- Tracks how entity attributes change over time
CREATE TABLE IF NOT EXISTS world_state_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at     TIMESTAMPTZ DEFAULT NOW(),
  entity_id       UUID        REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  attribute       TEXT        NOT NULL,
  value           JSONB       NOT NULL,
  previous_value  JSONB,
  changed_by      TEXT,        -- 'system', clerk user_id, 'external_feed:name'
  source          TEXT,
  confidence      FLOAT       DEFAULT 1.0
);

-- Indexes for time-range queries on world state
CREATE INDEX IF NOT EXISTS idx_world_state_entity_time
  ON world_state_snapshots (entity_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_world_state_attribute
  ON world_state_snapshots (attribute, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_relationship_type
  ON knowledge_edges (relationship_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_causal
  ON knowledge_edges (relationship_type, causal_strength DESC)
  WHERE relationship_type = 'CAUSES';

-- ============================================================
-- PHASE 2: Delta Engine / Cost Module (Truth QC Layer)
-- Every AI output gets scored against the world state.
-- Builds a per-model truth track record over time.
-- ============================================================

-- Audit log for AI output claims vs. world state
CREATE TABLE IF NOT EXISTS ai_output_audit (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  session_id        TEXT,
  model             TEXT        NOT NULL,
  claim_text        TEXT        NOT NULL,
  claim_embedding   VECTOR(1536),
  verdict           TEXT        NOT NULL
                    CHECK (verdict IN (
                      'CONFIRMED',
                      'SUPPORTED',
                      'UNVERIFIED',
                      'CONTRADICTED',
                      'MISATTRIBUTED',
                      'OUTDATED'
                    )),
  confidence        FLOAT,
  graph_edge_id     UUID        REFERENCES knowledge_edges(id),
  contradicts_node  UUID        REFERENCES knowledge_nodes(id),
  delta_score       FLOAT       CHECK (delta_score BETWEEN 0.0 AND 1.0),
  domain            TEXT        -- 'code', 'current_events', 'product', 'general', etc.
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_model_domain
  ON ai_output_audit (model, domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_audit_verdict
  ON ai_output_audit (verdict, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_audit_session
  ON ai_output_audit (session_id, created_at DESC);

-- Materialized view: per-model truth scores by domain
-- Refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY model_truth_scores;
-- Schedule refresh in cron or after batch audit runs.
CREATE MATERIALIZED VIEW IF NOT EXISTS model_truth_scores AS
SELECT
  model,
  domain,
  COUNT(*)                                                          AS total_claims,
  ROUND(AVG(CASE WHEN verdict = 'CONFIRMED'     THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                                                                    AS confirmed_rate,
  ROUND(AVG(CASE WHEN verdict = 'SUPPORTED'     THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                                                                    AS supported_rate,
  ROUND(AVG(CASE WHEN verdict = 'CONTRADICTED'  THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                                                                    AS hallucination_rate,
  ROUND(AVG(CASE WHEN verdict = 'MISATTRIBUTED' THEN 1.0 ELSE 0.0 END)::NUMERIC, 4)
                                                                    AS misattribution_rate,
  ROUND(AVG(delta_score)::NUMERIC, 4)                               AS avg_delta_score,
  MAX(created_at)                                                   AS last_evaluated
FROM ai_output_audit
GROUP BY model, domain;

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_truth_scores_pk
  ON model_truth_scores (model, domain);

-- ============================================================
-- PHASE 3: Speaker Attribution (Solves Pronoun/Speaker Collapse)
-- Every claim in the graph is tagged with who said it,
-- when, and in what context — eliminating misattribution.
-- ============================================================

CREATE TABLE IF NOT EXISTS claim_attributions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  claim_node_id         UUID        REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  speaker_id            TEXT        NOT NULL,   -- clerk user_id, 'system', 'external:source'
  speaker_display_name  TEXT,
  asserted_at           TIMESTAMPTZ DEFAULT NOW(),
  context_session_id    TEXT,
  context_description   TEXT,
  confidence_at_assertion FLOAT     DEFAULT 1.0,
  retracted_at          TIMESTAMPTZ,            -- NULL = still stands
  retracted_reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_claim_attributions_speaker
  ON claim_attributions (speaker_id, asserted_at DESC);

CREATE INDEX IF NOT EXISTS idx_claim_attributions_claim
  ON claim_attributions (claim_node_id);

-- ============================================================
-- RLS — Lock down all new tables
-- All access is via service_role (server-side only).
-- ============================================================

ALTER TABLE world_state_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_output_audit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_attributions     ENABLE ROW LEVEL SECURITY;

-- No client-side policies — service_role bypasses RLS.
-- Add explicit policies here if/when client-side access is needed.

-- ============================================================
-- COMMENTS — for discoverability
-- ============================================================

COMMENT ON TABLE world_state_snapshots IS
  'Point-in-time captures of entity attribute changes. Foundation for object permanence across sessions.';

COMMENT ON TABLE ai_output_audit IS
  'Audit log scoring AI model claims against the world state graph. Powers per-model truth tracking.';

COMMENT ON MATERIALIZED VIEW model_truth_scores IS
  'Per-model hallucination and confirmation rates by domain. Refresh after audit batches.';

COMMENT ON TABLE claim_attributions IS
  'Speaker attribution for all claims in the knowledge graph. Solves pronoun/intent misattribution.';

COMMENT ON COLUMN knowledge_edges.relationship_type IS
  'Typed edge: CAUSES, CONTRADICTS, SUPPORTS, PRECEDES, IS_A, ASSERTED_BY, etc. See ARCHITECTURE.md.';

COMMENT ON COLUMN knowledge_edges.causal_strength IS
  'For CAUSES edges: 0.0 = weak correlation, 1.0 = deterministic causation.';
