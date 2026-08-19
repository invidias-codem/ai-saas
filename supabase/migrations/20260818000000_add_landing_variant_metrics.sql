-- Extend get_telemetry_metrics RPC to aggregate landing_variant_viewed events
-- for the Expert-as-a-Service A/B test.
--
-- Adds a 'landing_variants' JSONB key mapping variant -> count, e.g.:
--   { "a": 1243, "b": 1198, "c": 1301 }

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

        -- Landing variant A/B test (NEW)
        'landing_variants', (
            SELECT COALESCE(jsonb_object_agg(variant, cnt), '{}'::jsonb)
            FROM (
                SELECT metadata->>'variant' AS variant, COUNT(*) AS cnt
                FROM telemetry_events
                WHERE event_type = 'landing_variant_viewed'
                  AND created_at > now() - make_interval(days := lookback_days)
                GROUP BY metadata->>'variant'
            ) sub
        ),

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

        -- Aggregated totals
        'total_events', (
            SELECT COUNT(*) FROM telemetry_events
            WHERE created_at > now() - make_interval(days := lookback_days)
        )
    ) INTO result;

    RETURN result;
END;
$$;
