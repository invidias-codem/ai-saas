-- ============================================================
-- World Model — Causal Schema Migration (Event-Sourced Source of Truth)
-- Date: 2026-08-29
-- Reaffirms: wm_events is the immutable source of truth. The legacy
--   knowledge_nodes / knowledge_edges tables are derived read projections
--   and vector search targets going forward.
--
-- This migration:
--   1. Expands the relationship enum with ENABLES + REQUIRES
--   2. Adds causal/temporal/delta columns to the wm_edges_view read projection
--   3. Adds the get_causal_chain RPC for BFS causal traversal
--   4. Standardizes the delta JSONB for SUPERSEDES / CONTRADICTS / OBSOLETED
--   5. Backfills legacy knowledge_edges into the event log
-- ============================================================

-- ============================================================
-- 1. EDGE TYPE EXPANSION — ENABLES + REQUIRES
-- ============================================================

-- Legacy graph: relax the CHECK constraint to include the two new types.
-- Postgres cannot ALTER a CHECK constraint in place; drop + re-add.
ALTER TABLE knowledge_edges
  DROP CONSTRAINT IF EXISTS knowledge_edges_relationship_type_check;

ALTER TABLE knowledge_edges
  ADD CONSTRAINT knowledge_edges_relationship_type_check
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
    'SUPERSEDES',
    'ENABLES',          -- structural dependency: A enables/permits B
    'REQUIRES'          -- structural prerequisite: A depends on / requires B
  ));

-- Normalize the canonical relationship enum into a single reusable type so
-- the event-sourced layer, views, and RPCs share one definition.
DO $$ BEGIN
  CREATE TYPE wm_relationship_type AS ENUM (
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
    'SUPERSEDES',
    'ENABLES',
    'REQUIRES'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. STANDARDIZED DELTA PAYLOAD
--    Every SUPERSEDES / CONTRADICTS / OBSOLETED event carries a strictly
--    typed delta JSONB so engines never suffer serialization drift.
--    Shape:
--      {
--        "before":   <previous value / payload>,
--        "after":    <new value / payload | null for OBSOLETED>,
--        "reason":   <string human/machine rationale>,
--        "evidence": [ { "edge_id": uuid, "weight": float } ],
--        "score":    <float delta_score 0.0 - 1.0>
--      }
-- ============================================================

-- Helper: validate + normalize the delta object before persisting.
-- Returns the sanitized JSONB or raises on malformed structure.
CREATE OR REPLACE FUNCTION normalize_wm_delta(p_delta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_before  jsonb := p_delta->'before';
  v_after   jsonb := p_delta->'after';
  v_reason  text  := COALESCE(p_delta->>'reason', '');
  v_evidence jsonb := COALESCE(p_delta->'evidence', '[]'::jsonb);
  v_score   float := COALESCE((p_delta->>'score')::float, 0.0);
BEGIN
  -- reason must be a non-empty string
  IF v_reason IS NULL OR length(trim(v_reason)) = 0 THEN
    RAISE EXCEPTION 'delta.reason is required and must be non-empty';
  END IF;

  -- evidence must be an array of {edge_id, weight}
  IF jsonb_typeof(v_evidence) <> 'array' THEN
    RAISE EXCEPTION 'delta.evidence must be a JSON array';
  END IF;

  -- score must be between 0.0 and 1.0
  IF v_score < 0.0 OR v_score > 1.0 THEN
    RAISE EXCEPTION 'delta.score must be between 0.0 and 1.0';
  END IF;

  RETURN jsonb_build_object(
    'before',   v_before,
    'after',    v_after,
    'reason',   trim(v_reason),
    'evidence', v_evidence,
    'score',    v_score
  );
END;
$$;

-- Assert the delta contract at write time for the three mutating event types.
CREATE OR REPLACE FUNCTION enforce_wm_delta_on_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type IN ('CONTRADICTED', 'OBSOLETED', 'MERGED') THEN
    IF NEW.payload IS NULL OR NEW.payload->'delta' IS NULL THEN
      RAISE EXCEPTION 'CONTRADICTED/OBSOLETED/MERGED events require a payload.delta JSONB';
    END IF;
    -- Normalize in place (raises on malformed structure)
    NEW.payload := jsonb_set(
      NEW.payload,
      '{delta}',
      normalize_wm_delta(NEW.payload->'delta'),
      true
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wm_delta_on_mutation
BEFORE INSERT ON wm_events
FOR EACH ROW
EXECUTE FUNCTION enforce_wm_delta_on_mutation();

-- ============================================================
-- 3. WM_EDGES_VIEW — expose causal/temporal fields
-- ============================================================

CREATE OR REPLACE VIEW wm_edges_view AS
SELECT
    entity_id AS id,
    current_payload->>'user_id' AS user_id,
    current_payload->>'source_node_id' AS source_node_id,
    current_payload->>'target_node_id' AS target_node_id,
    current_payload->>'relation' AS relation,
    COALESCE(current_payload->>'relationship_type', current_payload->>'relation')
        AS relationship_type,
    (current_payload->>'causal_strength')::numeric AS causal_strength,
    (current_payload->>'confidence')::numeric AS confidence,
    NULLIF(current_payload->>'valid_from', '')::timestamptz AS valid_from,
    NULLIF(current_payload->>'valid_until', '')::timestamptz AS valid_until,
    current_payload->'delta' AS delta,
    current_trust_tier AS trust_tier
FROM wm_current_entities
WHERE latest_event_type != 'OBSOLETED'
  AND current_payload->>'entity_type' = 'edge';

-- ============================================================
-- 4. get_causal_chain RPC — BFS causal traversal over the projection
-- ============================================================

CREATE OR REPLACE FUNCTION get_causal_chain(
  p_root_node_id uuid,
  p_max_depth int DEFAULT 3,
  p_min_causal_strength float DEFAULT 0.0
)
RETURNS TABLE (
  depth int,
  source_node_id uuid,
  target_node_id uuid,
  relationship_type text,
  causal_strength float,
  confidence float,
  valid_from timestamptz,
  valid_until timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_active uuid[] := ARRAY[p_root_node_id];
  v_next uuid[];
  v_visited uuid[] := ARRAY[p_root_node_id];
  v_depth int := 0;
BEGIN
  WHILE v_depth < p_max_depth AND array_length(v_active, 1) > 0 LOOP
    v_next := '{}';

    RETURN QUERY
    SELECT
      v_depth + 1 AS depth,
      e.source_node_id::uuid,
      e.target_node_id::uuid,
      e.relationship_type,
      COALESCE(e.causal_strength, 0.0)::float,
      COALESCE(e.confidence, 1.0)::float,
      e.valid_from,
      e.valid_until
    FROM wm_edges_view e
    WHERE e.source_node_id::uuid = ANY(v_active)
      AND e.relationship_type IN ('CAUSES', 'PRECEDES', 'SUPPORTS', 'ENABLES', 'REQUIRES', 'INHIBITS')
      AND COALESCE(e.causal_strength, 0.0) >= p_min_causal_strength
      AND (e.valid_until IS NULL OR e.valid_until > NOW());

    -- Collect newly discovered targets for the next frontier
    SELECT array_agg(DISTINCT e.target_node_id::uuid)
      INTO v_next
    FROM wm_edges_view e
    WHERE e.source_node_id::uuid = ANY(v_active)
      AND e.relationship_type IN ('CAUSES', 'PRECEDES', 'SUPPORTS', 'ENABLES', 'REQUIRES', 'INHIBITS')
      AND (e.valid_until IS NULL OR e.valid_until > NOW());

    -- Prune already-visited nodes to avoid cycles.
    -- Collect the frontier as a single unnested set, subtract visited,
    -- dedupe, then re-aggregate back into an array.
    IF v_next IS NOT NULL THEN
      SELECT ARRAY (
        SELECT DISTINCT n
        FROM unnest(v_next) AS n
        WHERE NOT (n = ANY (v_visited))
      )
      INTO v_next;

      v_visited := v_visited || v_next;
    END IF;

    v_active := v_next;
    v_depth := v_depth + 1;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. LEGACY BACKFILL — migrate existing causal edges into the event log
--    Idempotent: skips edges already represented in wm_events.
-- ============================================================

INSERT INTO wm_events (entity_id, event_type, payload, trust_tier, source_model, context_version_id)
SELECT
  ke.id AS entity_id,
  'ASSERTED'::wm_event_type,
  jsonb_build_object(
    'entity_type', 'edge',
    'source_node_id', ke.source_node_id::text,
    'target_node_id', ke.target_node_id::text,
    'relation', ke.relationship_type,
    'relationship_type', ke.relationship_type,
    'causal_strength', COALESCE(ke.causal_strength, 0.5),
    'confidence', COALESCE(ke.confidence, 1.0),
    'valid_from', COALESCE(ke.valid_from, NOW()),
    'valid_until', ke.valid_until
  ),
  'UNVERIFIED'::trust_tier,
  'system:legacy-backfill',
  'backfill:' || ke.id::text
FROM knowledge_edges ke
WHERE ke.relationship_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM wm_events we
    WHERE we.entity_id = ke.id
  );

-- ============================================================
-- 6. COMMENTS
-- ============================================================

COMMENT ON TYPE wm_relationship_type IS
  'Canonical world-model edge type enum, shared by views + RPCs. Includes ENABLES/REQUIRES for structural dependencies.';

COMMENT ON COLUMN wm_events.payload IS
  'Edge events carry relationship_type/causal_strength/confidence/valid_from/valid_until. Mutating events carry a standardized delta {before,after,reason,evidence,score}.';