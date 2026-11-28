-- risk_weights: static Single Loss Expectancy (SLE) configuration for ALE calculation.
-- Allows finance/ops to adjust event severity without redeploying code.

CREATE TABLE IF NOT EXISTS public.risk_weights (
  event_type text PRIMARY KEY,
  atlas_tactic text,
  sle_usd numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed baseline weights aligned with riskQuantifier.ts SLE weights.
INSERT INTO public.risk_weights (event_type, atlas_tactic, sle_usd, severity) VALUES
  ('provider_fallback', NULL, 0.05, 'low'),
  ('circuit_breaker_trip', NULL, 1.00, 'medium'),
  ('unauthorized_tool_attempt', 'AML.T0053', 5000.00, 'critical'),
  ('prompt_injection_attempt', 'AML.T0051', 5000.00, 'critical'),
  ('harness_selection_fallback', NULL, 0.10, 'low'),
  ('tool_execution_failure', NULL, 0.50, 'medium'),
  ('context_firewall_deny', NULL, 250.00, 'high')
ON CONFLICT (event_type) DO NOTHING;

-- RLS: read-only for authenticated users; inserts from service role / backend only.
ALTER TABLE public.risk_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read risk weights"
  ON public.risk_weights FOR SELECT
  TO authenticated
  USING (true);
