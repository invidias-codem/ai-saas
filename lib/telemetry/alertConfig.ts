/**
 * lib/telemetry/alertConfig.ts
 *
 * Typed threshold configuration for risk alerting.
 *
 * Operates on the /api/risk/ale JSON shape:
 * {
 *   event_type,
 *   total_occurrences_30d,
 *   projected_aro,
 *   current_ale_usd,
 *   severity
 * }
 */

export interface VelocityThreshold {
  event_type: string;
  windowMinutes: number;
  minOccurrences: number;
}

export interface FinancialThreshold {
  event_type: string;
  maxCurrentAleUsd: number;
}

export type ThresholdRule = VelocityThreshold | FinancialThreshold;

export const DEFAULT_VELOCITY_THRESHOLDS: VelocityThreshold[] = [
  { event_type: 'context_firewall_deny', windowMinutes: 15, minOccurrences: 5 },
  { event_type: 'unauthorized_tool_attempt', windowMinutes: 15, minOccurrences: 3 },
  { event_type: 'circuit_breaker_trip', windowMinutes: 15, minOccurrences: 4 },
];

export const DEFAULT_FINANCIAL_THRESHOLDS: FinancialThreshold[] = [
  { event_type: 'unauthorized_tool_attempt', maxCurrentAleUsd: 500 },
  { event_type: 'prompt_injection_attempt', maxCurrentAleUsd: 500 },
  { event_type: 'context_firewall_deny', maxCurrentAleUsd: 250 },
];

export interface AlertRuleSet {
  velocity: VelocityThreshold[];
  financial: FinancialThreshold[];
}

export const DEFAULT_ALERT_RULES: AlertRuleSet = {
  velocity: DEFAULT_VELOCITY_THRESHOLDS,
  financial: DEFAULT_FINANCIAL_THRESHOLDS,
};
