-- ============================================================
-- Lattice OS Telemetry Layer
-- Append-only event log for funnel metrics
-- ============================================================

-- 1. Events table
CREATE TABLE IF NOT EXISTS telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id TEXT,
    workspace_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_event_type_time
    ON telemetry_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_metadata
    ON telemetry_events USING GIN (metadata);

CREATE INDEX IF NOT EXISTS idx_telemetry_user_id
    ON telemetry_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_workspace_id
    ON telemetry_events (workspace_id, created_at DESC);

-- 2. RLS: service-role only
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

-- 3. Aggregation RPC
CREATE OR REPLACE FUNCTION get_telemetry_metrics(lookback_days INTEGER DEFAULT 7)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        -- Time window
        'lookback_days', lookback_days,
        'generated_at', now(),

        -- Data Refinery metrics
        'delta_verdicts', (
            SELECT jsonb_object_agg(verdict, cnt)
            FROM (
                SELECT metadata->>'verdict' AS verdict, COUNT(*) AS cnt
                FROM telemetry_events
                WHERE event_type = 'delta_detected'
                  AND created_at > now() - make_interval(days := lookback_days)
                GROUP BY metadata->>'verdict'
            ) sub
        ),

        -- PLG Nudge metrics
        'plg_nudges_shown', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'plg_nudge_shown'
              AND created_at > now() - make_interval(days := lookback_days)
        ),

        -- Stripe checkout funnel
        'stripe_checkouts_initiated', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'stripe_checkout_initiated'
              AND created_at > now() - make_interval(days := lookback_days)
        ),
        'stripe_checkouts_completed', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'stripe_checkout_completed'
              AND created_at > now() - make_interval(days := lookback_days)
        ),

        -- Code Builder debate loop metrics
        'debate_rounds_total', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'debate_round_completed'
              AND created_at > now() - make_interval(days := lookback_days)
        ),
        'debate_loops_accepted', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'debate_loop_accepted'
              AND created_at > now() - make_interval(days := lookback_days)
        ),
        'debate_rounds_avg', (
            SELECT COALESCE(AVG((metadata->>'attempts')::numeric), 0)
            FROM telemetry_events
            WHERE event_type = 'debate_loop_accepted'
              AND created_at > now() - make_interval(days := lookback_days)
        ),

        -- Bluesky engagement metrics
        'bluesky_drafts_created', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'bluesky_draft_created'
              AND created_at > now() - make_interval(days := lookback_days)
        ),
        'bluesky_drafts_approved', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'bluesky_draft_approved'
              AND created_at > now() - make_interval(days := lookback_days)
        ),
        'bluesky_drafts_rejected', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE event_type = 'bluesky_draft_rejected'
              AND created_at > now() - make_interval(days := lookback_days)
        ),

        -- Total events
        'total_events', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE created_at > now() - make_interval(days := lookback_days)
        )
    ) INTO result;

    RETURN result;
END;
$$;

-- 4. Materialized view for fast dashboard queries (refresh every 5 min via cron or manually)
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly_summary AS
SELECT
    date_trunc('hour', created_at) AS hour,
    event_type,
    COUNT(*) AS event_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM telemetry_events
WHERE created_at > now() - interval '7 days'
GROUP BY date_trunc('hour', created_at), event_type
ORDER BY hour DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_hourly_summary_pk
    ON telemetry_hourly_summary (hour, event_type);

CREATE INDEX IF NOT EXISTS idx_telemetry_hourly_summary_event
    ON telemetry_hourly_summary (event_type, hour DESC);

-- Comment for discoverability
COMMENT ON TABLE telemetry_events IS
    'Append-only telemetry event log for Lattice OS funnel metrics. Service-role writes only.';

COMMENT ON MATERIALIZED VIEW telemetry_hourly_summary IS
    'Hourly event counts by type. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY telemetry_hourly_summary;';
