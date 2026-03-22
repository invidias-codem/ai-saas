-- T-030: World Model Event Sourcing Schema (DDIA Step 1)
-- This table replaces direct mutations with an immutable event log for the Knowledge Graph.

CREATE TYPE wm_event_type AS ENUM (
    'ASSERTED',      -- A new fact/node was observed
    'CONTRADICTED',  -- A fact was challenged or overwritten
    'OBSOLETED',     -- A fact is no longer relevant (tombstone)
    'MERGED'         -- A node was merged with another entity
);

-- Create the 'trust_tier' enum from RFC-001 if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trust_tier') THEN
        CREATE TYPE trust_tier AS ENUM ('AXIOM', 'CONFIRMED', 'SUPPORTED', 'UNVERIFIED');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS wm_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL, -- The graph node or edge being modified
    event_type wm_event_type NOT NULL,
    payload JSONB NOT NULL, -- The properties being asserted/changed
    trust_tier trust_tier NOT NULL DEFAULT 'UNVERIFIED',
    source_model TEXT NOT NULL, -- e.g., 'gemini-3.1-pro', 'claude-3-7-sonnet'
    context_version_id TEXT, -- Logical clock / causal dependency reference
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for reconstructing the state of a single entity quickly
CREATE INDEX idx_wm_events_entity_id ON wm_events(entity_id);

-- Index for causal consistency / logical clock synchronization
CREATE INDEX idx_wm_events_context_version ON wm_events(context_version_id);

-- ----------------------------------------------------------------------------
-- IMMUTABILITY ENFORCEMENT
-- The World Model log must be append-only. 
-- Even admins cannot UPDATE or DELETE an event once logged.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_wm_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'World Model Event Log is immutable. UPDATE and DELETE are strictly forbidden. To invalidate a fact, append an OBSOLETED or CONTRADICTED event.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wm_events_append_only
BEFORE UPDATE OR DELETE ON wm_events
FOR EACH ROW
EXECUTE FUNCTION enforce_wm_events_append_only();

-- ----------------------------------------------------------------------------
-- T-032: MATERIALIZED VIEW (PROJECTION)
-- ----------------------------------------------------------------------------
-- This view projects the append-only log into a fast read-optimized table 
-- representing the CURRENT state of the World Model graph.

CREATE MATERIALIZED VIEW wm_current_entities AS
SELECT DISTINCT ON (entity_id)
    entity_id,
    event_type AS latest_event_type,
    payload AS current_payload,
    trust_tier AS current_trust_tier,
    source_model AS last_modified_by,
    context_version_id AS last_context_version,
    created_at AS last_updated_at
FROM wm_events
ORDER BY entity_id, created_at DESC;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX idx_wm_current_entities_id ON wm_current_entities(entity_id);

-- Index for fast context retrieval by trust tier
CREATE INDEX idx_wm_current_entities_trust ON wm_current_entities(current_trust_tier);

-- Helper function to refresh the view (to be called via cron or trigger)
CREATE OR REPLACE FUNCTION refresh_wm_current_entities()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY wm_current_entities;
END;
$$ LANGUAGE plpgsql;
