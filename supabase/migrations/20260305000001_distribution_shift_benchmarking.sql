-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Distribution Shift Detection + Model Self-Benchmarking Tables
-- Part of: UCOL World Model v2 — World-Adapting Model Architecture
-- Created: 2026-03-05
-- Related: lib/world-model/distribution-shift/, lib/world-model/benchmarking/
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- wm_query_fingerprints
-- Query fingerprints for distribution shift detection.
-- Captures domain, keywords, and model usage per session
-- so the detector can spot when query patterns drift from
-- the distribution the world graph was last calibrated on.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wm_query_fingerprints (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT        NOT NULL,
  domain      TEXT        NOT NULL
    CHECK (domain IN (
      'code', 'reasoning', 'research',
      'current_events', 'strategy', 'orchestration', 'general'
    )),
  subdomain   TEXT,
  keywords    TEXT[]      NOT NULL DEFAULT '{}',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_used  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wm_query_fingerprints IS
  'Per-query fingerprints capturing domain, keywords, and model used. '
  'Feeds the distribution shift detector to identify when live query patterns '
  'diverge from the training distribution of the world graph.';

COMMENT ON COLUMN wm_query_fingerprints.keywords IS
  'Extracted keyword tokens from the query, lowercased and deduplicated. '
  'Used to compute JS divergence against stored distribution histograms.';

COMMENT ON COLUMN wm_query_fingerprints.subdomain IS
  'Optional finer-grained sub-classification within domain, e.g. domain=code → subdomain=typescript.';

-- ─────────────────────────────────────────────
-- wm_staleness_events
-- Emitted when the distribution shift detector determines
-- the world graph has drifted beyond acceptable thresholds.
-- Severity drives automated response: refresh vs. manual review.
-- System-only writes (no direct user INSERT/UPDATE).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wm_staleness_events (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain                  TEXT        NOT NULL,
  js_divergence           FLOAT       NOT NULL,
  graph_staleness_hours   FLOAT       NOT NULL,
  severity                TEXT        NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  recommended_action      TEXT        NOT NULL
    CHECK (recommended_action IN (
      'refresh_graph', 'add_grounding_feed',
      'manual_review', 'emergency_update'
    )),
  resolved_at             TIMESTAMPTZ,
  resolved_by             TEXT        -- clerk user_id, 'system', or pipeline identifier
);

COMMENT ON TABLE wm_staleness_events IS
  'Emitted events when the distribution shift detector crosses severity thresholds. '
  'Drives automated graph refresh, grounding feed injection, or human escalation. '
  'Written by the system only — no direct user writes.';

COMMENT ON COLUMN wm_staleness_events.js_divergence IS
  'Jensen-Shannon divergence between current query distribution and calibration baseline. '
  'Range [0, 1]. Values above 0.3 typically warrant action.';

COMMENT ON COLUMN wm_staleness_events.graph_staleness_hours IS
  'Hours since the world graph for this domain was last refreshed or verified.';

COMMENT ON COLUMN wm_staleness_events.severity IS
  'low → informational | medium → schedule refresh | high → urgent | critical → emergency_update';

-- ─────────────────────────────────────────────
-- wm_benchmark_results
-- Stores scored benchmark results for every AI model response.
-- Feeds the feedback loop for automatic weight adjustment and demotion.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wm_benchmark_results (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id                  TEXT        NOT NULL,
  model                       TEXT        NOT NULL,
  domain                      TEXT        NOT NULL,
  dimensions                  JSONB       NOT NULL DEFAULT '{}',
  composite_score             FLOAT       NOT NULL,
  latency_ms                  INTEGER     NOT NULL,
  audit                       JSONB       NOT NULL DEFAULT '{}',
  routing_decision_id         TEXT,
  processed_by_feedback_loop  BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE wm_benchmark_results IS
  'Scored benchmark results for each AI model response across sessions. '
  'composite_score aggregates individual dimension scores (factuality, relevance, latency, etc.). '
  'Unprocessed rows (processed_by_feedback_loop=false) are consumed by the nightly feedback loop '
  'to update model routing weights.';

COMMENT ON COLUMN wm_benchmark_results.dimensions IS
  'Per-dimension score breakdown. Schema: { "factuality": 0.92, "relevance": 0.87, "latency_score": 0.75, ... }';

COMMENT ON COLUMN wm_benchmark_results.audit IS
  'Serialized AIOutputAudit snapshot at the time of scoring. '
  'Preserved for replay and audit trail.';

COMMENT ON COLUMN wm_benchmark_results.processed_by_feedback_loop IS
  'Set to true after the feedback loop has incorporated this result into routing weights. '
  'Partial index on false keeps the feedback loop query O(new_rows) rather than O(total_rows).';

-- ─────────────────────────────────────────────
-- wm_model_routing_weights
-- Live per-(model, domain) routing weights updated by the feedback loop.
-- The router reads these weights to bias model selection in real time.
-- System-only writes (no direct user INSERT/UPDATE).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wm_model_routing_weights (
  model            TEXT    NOT NULL,
  domain           TEXT    NOT NULL,
  routing_weight   FLOAT   NOT NULL DEFAULT 1.0,
  demoted          BOOLEAN NOT NULL DEFAULT FALSE,
  demotion_reason  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (model, domain)
);

COMMENT ON TABLE wm_model_routing_weights IS
  'Live routing weight table for per-domain model selection. '
  'Updated exclusively by the feedback loop after processing benchmark results. '
  'demoted=true means the model will be excluded from routing for this domain '
  'until manually re-enabled or performance recovers.';

COMMENT ON COLUMN wm_model_routing_weights.routing_weight IS
  'Softmax-ready weight [0, ∞). Higher = more likely to be selected. '
  'Feedback loop increases/decreases based on rolling composite_score deltas.';

COMMENT ON COLUMN wm_model_routing_weights.demotion_reason IS
  'Human-readable reason for demotion, e.g. "composite_score < 0.4 for 3 consecutive cycles".';

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────

-- wm_query_fingerprints
CREATE INDEX IF NOT EXISTS idx_wm_query_fingerprints_domain_timestamp
  ON wm_query_fingerprints (domain, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_wm_query_fingerprints_session
  ON wm_query_fingerprints (session_id);

-- wm_staleness_events
CREATE INDEX IF NOT EXISTS idx_wm_staleness_events_domain_created
  ON wm_staleness_events (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wm_staleness_events_severity
  ON wm_staleness_events (severity, created_at DESC);

-- wm_benchmark_results
CREATE INDEX IF NOT EXISTS idx_wm_benchmark_results_model_domain_created
  ON wm_benchmark_results (model, domain, created_at DESC);

-- Partial index: only unprocessed rows — keeps feedback loop queries fast
CREATE INDEX IF NOT EXISTS idx_wm_benchmark_results_unprocessed
  ON wm_benchmark_results (created_at ASC)
  WHERE processed_by_feedback_loop = FALSE;

-- wm_model_routing_weights: PK (model, domain) covers all router lookups

-- ─────────────────────────────────────────────
-- Row Level Security
-- Service role: full unrestricted access.
-- Authenticated users: SELECT on all tables;
--   INSERT on wm_query_fingerprints + wm_benchmark_results only.
-- wm_staleness_events + wm_model_routing_weights: system-only writes.
-- ─────────────────────────────────────────────

ALTER TABLE wm_query_fingerprints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wm_staleness_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wm_benchmark_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wm_model_routing_weights ENABLE ROW LEVEL SECURITY;

-- ── Drop policies idempotently before (re)creating them ──
-- PostgreSQL has no CREATE POLICY IF NOT EXISTS, so we drop first.

DROP POLICY IF EXISTS "service_role_full_access_wm_query_fingerprints"    ON wm_query_fingerprints;
DROP POLICY IF EXISTS "service_role_full_access_wm_staleness_events"       ON wm_staleness_events;
DROP POLICY IF EXISTS "service_role_full_access_wm_benchmark_results"      ON wm_benchmark_results;
DROP POLICY IF EXISTS "service_role_full_access_wm_model_routing_weights"  ON wm_model_routing_weights;

DROP POLICY IF EXISTS "authenticated_select_wm_query_fingerprints"         ON wm_query_fingerprints;
DROP POLICY IF EXISTS "authenticated_select_wm_staleness_events"           ON wm_staleness_events;
DROP POLICY IF EXISTS "authenticated_select_wm_benchmark_results"          ON wm_benchmark_results;
DROP POLICY IF EXISTS "authenticated_select_wm_model_routing_weights"      ON wm_model_routing_weights;

DROP POLICY IF EXISTS "authenticated_insert_wm_query_fingerprints"        ON wm_query_fingerprints;
DROP POLICY IF EXISTS "authenticated_insert_wm_benchmark_results"         ON wm_benchmark_results;

-- ── Service role: full access (bypasses RLS by default, but explicit is clear) ──

CREATE POLICY "service_role_full_access_wm_query_fingerprints"
  ON wm_query_fingerprints
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_wm_staleness_events"
  ON wm_staleness_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_wm_benchmark_results"
  ON wm_benchmark_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_wm_model_routing_weights"
  ON wm_model_routing_weights
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Authenticated users: SELECT on all tables ──

CREATE POLICY "authenticated_select_wm_query_fingerprints"
  ON wm_query_fingerprints
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_wm_staleness_events"
  ON wm_staleness_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_wm_benchmark_results"
  ON wm_benchmark_results
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_select_wm_model_routing_weights"
  ON wm_model_routing_weights
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Authenticated users: INSERT on wm_query_fingerprints ──
-- (Users can log their own query fingerprints; session_id is caller-provided)

CREATE POLICY "authenticated_insert_wm_query_fingerprints"
  ON wm_query_fingerprints
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ── Authenticated users: INSERT on wm_benchmark_results ──
-- (Client-side scoring is allowed; results must be validated server-side before logging)

CREATE POLICY "authenticated_insert_wm_benchmark_results"
  ON wm_benchmark_results
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Note: wm_staleness_events and wm_model_routing_weights have NO authenticated INSERT/UPDATE.
-- All writes to these tables must go through the service role (backend only).
