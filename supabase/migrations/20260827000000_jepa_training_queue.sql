-- ============================================================
-- JEPA Training Queue (MBRL Offline Refinement)
-- ============================================================

-- 1. Divergence events table
CREATE TABLE IF NOT EXISTS jepa_divergence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    predictor_id TEXT,
    circuit_state TEXT,
    divergence DOUBLE PRECISION,
    confidence DOUBLE PRECISION,
    detail TEXT,
    latency_ms INTEGER,
    fallback_used BOOLEAN,
    query_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jepa_events_type_time
    ON jepa_divergence_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jepa_events_divergence
    ON jepa_divergence_events (divergence DESC, created_at DESC)
    WHERE divergence IS NOT NULL;

-- 2. Training queue table
CREATE TABLE IF NOT EXISTS jepa_training_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    divergence_event_id UUID REFERENCES jepa_divergence_events(id) ON DELETE CASCADE,
    query_hash TEXT,
    divergence DOUBLE PRECISION NOT NULL,
    initial_state JSONB NOT NULL,
    action JSONB NOT NULL,
    resulting_state JSONB NOT NULL,
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_jepa_queue_status
    ON jepa_training_queue (status, queued_at ASC);

CREATE INDEX IF NOT EXISTS idx_jepa_queue_divergence
    ON jepa_training_queue (divergence DESC)
    WHERE status = 'pending';

-- 3. RLS: service-role only
ALTER TABLE jepa_divergence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE jepa_training_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY jepa_divergence_events_service_role
    ON jepa_divergence_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY jepa_training_queue_service_role
    ON jepa_training_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Helper: enqueue high-divergence events
CREATE OR REPLACE FUNCTION enqueue_high_divergence_events(
    min_divergence DOUBLE PRECISION DEFAULT 0.7,
    batch_size INTEGER DEFAULT 50,
    older_than_minutes INTEGER DEFAULT 60
)
RETURNS SETOF jepa_training_queue
LANGUAGE plpgsql
AS $$
DECLARE
    inserted RECORD;
BEGIN
    FOR inserted IN
        INSERT INTO jepa_training_queue (
            divergence_event_id,
            query_hash,
            divergence,
            initial_state,
            action,
            resulting_state
        )
        SELECT
            id,
            query_hash,
            divergence,
            jsonb_build_object(
                'eventType', event_type,
                'detail', detail,
                'circuitState', circuit_state,
                'latencyMs', latency_ms,
                'fallbackUsed', fallback_used
            ),
            jsonb_build_object(
                'eventType', event_type,
                'predictorId', predictor_id
            ),
            jsonb_build_object(
                'source', 'jepa_divergence_event',
                'createdAt', created_at
            )
        FROM jepa_divergence_events
        WHERE
            divergence >= min_divergence
            AND created_at > now() - make_interval(minutes := older_than_minutes)
            AND id NOT IN (
                SELECT divergence_event_id
                FROM jepa_training_queue
                WHERE divergence_event_id IS NOT NULL
            )
        ORDER BY divergence DESC, created_at DESC
        LIMIT batch_size
        RETURNING *
    LOOP
        RETURN NEXT inserted;
    END LOOP;
END;
$$;
