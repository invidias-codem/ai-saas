-- Calibrate JEV shadow decisions against production outcomes.
-- Join key: request_id. Cohorts: production intent category.
-- Run: supabase db query --linked -f scripts/jev-calibration.sql
--
-- Joins telemetry_events (jev_shadow_decision events, main DB)
-- to ucol_routing_telemetry (per-request outcome rows, main DB).
--
-- COHORT GUARD: tierPolicyVersion bumped 1→2 when jevTier was redefined as
-- v2 capability_requirement. Aggregating the two semantics would corrupt the
-- calibration signal — every metric is GROUP BY tier_policy_version, and the
-- 7-day window is retained per cohort.

WITH jev AS (
    SELECT
        metadata->>'requestId'                    AS request_id,
        coalesce((metadata->>'tierPolicyVersion')::int, 1) AS tier_policy_version,
        (metadata->>'agreement')::boolean         AS agreement,
        metadata->>'jevIntent'                    AS jev_intent,
        metadata->>'productionIntent'              AS production_intent,
        metadata->>'jevTier'                      AS jev_tier,
        metadata->>'productionTier'               AS production_tier,
        metadata->>'jevConfidence'                AS jev_confidence,
        metadata->>'jevFailureReason'              AS failure_reason,
        (metadata->>'jevLatencyMs')::numeric       AS jev_latency_ms,
        (metadata->>'jevInputTokens')::numeric     AS jev_input_tokens,
        (metadata->>'complexityScore')::numeric    AS complexity_score,
        (metadata->>'requiresToolsNoul')::numeric AS requires_tools_noul,
        metadata->>'status'                        AS status
    FROM public.telemetry_events
    WHERE event_type = 'jev_shadow_decision'
      AND created_at > now() - interval '7 days'
),
joined AS (
    SELECT
        j.*,
        t.outcome,
        t.latency_ms  AS production_latency_ms,
        t.estimated_cost_usd,
        t.user_correction_signal,
        t.route_timestamp
    FROM jev j
    LEFT JOIN public.ucol_routing_telemetry t
        ON t.request_id = j.request_id
)
SELECT
    tier_policy_version,
    -- Volume + health
    count(*)                                              AS total_jev_events,
    count(*) FILTER (WHERE status = 'ok')                 AS eval_ok,
    count(*) FILTER (WHERE status = 'unavailable')         AS eval_unavailable,
    round(100.0 * count(*) FILTER (WHERE status = 'ok')
        / greatest(count(*), 1), 1)                        AS pct_available,

    -- Agreement
    round(100.0 * count(*) FILTER (WHERE agreement)
        / greatest(count(*) FILTER (WHERE status = 'ok'), 1), 1) AS pct_agreement,

    -- JEV cost + latency (whole-operation)
    round(avg(jev_latency_ms) FILTER (WHERE status = 'ok'))      AS jev_p50ish_latency_ms,
    round(max(jev_latency_ms) FILTER (WHERE status = 'ok'))      AS jev_max_latency_ms,
    sum(jev_input_tokens) FILTER (WHERE status = 'ok')           AS jev_input_tokens_total,

    -- THE calibration signal: when JEV and B2 disagree, what ACTUALLY happened?
    count(*) FILTER (WHERE status = 'ok' AND NOT agreement)      AS disagreements,
    round(100.0 * count(*) FILTER (WHERE status = 'ok' AND NOT agreement
        AND outcome = 'success')
        / greatest(count(*) FILTER (WHERE status = 'ok' AND NOT agreement), 1), 1)
        AS pct_disagree_outcome_success,
    round(100.0 * count(*) FILTER (WHERE status = 'ok' AND agreement
        AND outcome = 'success')
        / greatest(count(*) FILTER (WHERE status = 'ok' AND agreement), 1), 1)
        AS pct_agree_outcome_success,

    -- Under/over-provisioning: production tier above JEV's read = over
    count(*) FILTER (WHERE production_tier = 'reasoning' AND jev_tier = 'fast') AS over_provisioned,
    count(*) FILTER (WHERE production_tier = 'fast' AND jev_tier = 'reasoning') AS under_provisioned
FROM joined
GROUP BY tier_policy_version
ORDER BY tier_policy_version;
