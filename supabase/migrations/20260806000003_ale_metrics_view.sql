-- ale_metrics_view: live ALE aggregation from risk_events joined to risk_weights.
-- Computes 30-day occurrence counts and projects ALE without storing duplicates.

CREATE OR REPLACE VIEW public.ale_metrics_view AS
SELECT
  w.event_type,
  COALESCE(COUNT(e.id), 0) AS total_occurrences_30d,
  -- Project annualized rate from 30-day count: ARO = count * (365.0 / 30.0)
  COALESCE(COUNT(e.id), 0) * (365.0 / 30.0) AS projected_aro,
  w.sle_usd,
  COALESCE(COUNT(e.id), 0) * (365.0 / 30.0) * w.sle_usd AS current_ale_usd,
  w.severity,
  w.atlas_tactic
FROM public.risk_weights w
LEFT JOIN public.risk_events e
  ON e.event_type = w.event_type
  AND e.timestamp >= now() - interval '30 days'
GROUP BY w.event_type, w.sle_usd, w.severity, w.atlas_tactic;

COMMENT ON VIEW public.ale_metrics_view IS 'Live ALE metrics derived from risk_events and risk_weights.';
