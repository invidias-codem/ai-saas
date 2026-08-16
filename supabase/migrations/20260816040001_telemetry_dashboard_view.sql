-- ============================================================
-- Telemetry Dashboard View
-- Quick-access view for monitoring funnel metrics without
-- building a frontend dashboard.
--
-- Query directly in Supabase Dashboard:
--   SELECT * FROM telemetry_dashboard;
-- ============================================================

CREATE OR REPLACE VIEW telemetry_dashboard AS
WITH daily_counts AS (
    SELECT
        date_trunc('day', created_at) AS day,
        event_type,
        COUNT(*) AS event_count,
        COUNT(DISTINCT user_id) AS unique_users
    FROM telemetry_events
    WHERE created_at > now() - interval '30 days'
    GROUP BY date_trunc('day', created_at), event_type
),
pivot AS (
    SELECT
        day,
        SUM(CASE WHEN event_type = 'delta_detected' THEN event_count ELSE 0 END) AS delta_detected,
        SUM(CASE WHEN event_type = 'plg_nudge_shown' THEN event_count ELSE 0 END) AS plg_nudges,
        SUM(CASE WHEN event_type = 'stripe_checkout_initiated' THEN event_count ELSE 0 END) AS checkouts_initiated,
        SUM(CASE WHEN event_type = 'stripe_checkout_completed' THEN event_count ELSE 0 END) AS checkouts_completed,
        SUM(CASE WHEN event_type = 'debate_round_completed' THEN event_count ELSE 0 END) AS debate_rounds,
        SUM(CASE WHEN event_type = 'debate_loop_accepted' THEN event_count ELSE 0 END) AS debate_accepted,
        SUM(CASE WHEN event_type = 'bluesky_draft_created' THEN event_count ELSE 0 END) AS bluesky_drafts,
        SUM(CASE WHEN event_type = 'bluesky_draft_approved' THEN event_count ELSE 0 END) AS bluesky_approved,
        SUM(CASE WHEN event_type = 'bluesky_draft_rejected' THEN event_count ELSE 0 END) AS bluesky_rejected,
        SUM(event_count) AS total_events
    FROM daily_counts
    GROUP BY day
)
SELECT
    day,
    delta_detected,
    plg_nudges,
    checkouts_initiated,
    checkouts_completed,
    CASE WHEN checkouts_initiated > 0
        THEN ROUND((checkouts_completed::numeric / checkouts_initiated::numeric) * 100, 1)
        ELSE 0
    END AS checkout_conversion_pct,
    debate_rounds,
    debate_accepted,
    CASE WHEN debate_accepted > 0
        THEN ROUND(debate_rounds::numeric / debate_accepted::numeric, 1)
        ELSE 0
    END AS avg_debate_rounds_per_accept,
    bluesky_drafts,
    bluesky_approved,
    bluesky_rejected,
    CASE WHEN bluesky_drafts > 0
        THEN ROUND((bluesky_approved::numeric / bluesky_drafts::numeric) * 100, 1)
        ELSE 0
    END AS bluesky_approval_pct,
    total_events
FROM pivot
ORDER BY day DESC;

COMMENT ON VIEW telemetry_dashboard IS
    'Daily funnel metrics for Lattice OS. Query: SELECT * FROM telemetry_dashboard;';
