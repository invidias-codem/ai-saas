/**
 * lib/telemetry/thresholdEvaluator.ts
 *
 * Pure threshold evaluation for risk telemetry.
 *
 * Input shape matches /api/risk/ale JSON:
 * {
 *   event_type,
 *   total_occurrences_30d,
 *   projected_aro,
 *   current_ale_usd,
 *   severity
 * }
 *
 * Velocity checks are currently modeled from 30d totals. To enable true
 * rolling-window evaluation later, enrich the metric payload with
 * `recentWindowCount` and `windowMinutes` from the watcher without changing
 * this evaluator's signature.
 */

import type { AlertRuleSet, FinancialThreshold, VelocityThreshold } from './alertConfig';

export type AlertSeverity = 'warn' | 'critical';

export interface Alert {
  event_type: string;
  severity: AlertSeverity;
  reason: 'velocity' | 'financial';
  threshold: number;
  actual: number;
  unit: string;
}

export interface Metric {
  event_type: string;
  total_occurrences_30d: number;
  projected_aro: number;
  current_ale_usd: number;
  severity: string;
  recentWindowCount?: number;
  windowMinutes?: number;
}

export function evaluateThresholds(metrics: Metric[], rules: AlertRuleSet): Alert[] {
  const alerts: Alert[] = [];

  for (const metric of metrics) {
    // Financial check
    const financialRule = rules.financial.find((r) => r.event_type === metric.event_type);
    if (financialRule && metric.current_ale_usd > financialRule.maxCurrentAleUsd) {
      alerts.push({
        event_type: metric.event_type,
        severity: 'critical',
        reason: 'financial',
        threshold: financialRule.maxCurrentAleUsd,
        actual: metric.current_ale_usd,
        unit: 'usd',
      });
    }

    // Velocity check
    const velocityRule = rules.velocity.find((r) => r.event_type === metric.event_type);
    if (velocityRule) {
      const observedCount = metric.recentWindowCount ?? metric.total_occurrences_30d;
      if (observedCount > velocityRule.minOccurrences) {
        const severity: AlertSeverity =
          metric.severity === 'critical' || observedCount >= velocityRule.minOccurrences * 2
            ? 'critical'
            : 'warn';

        alerts.push({
          event_type: metric.event_type,
          severity,
          reason: 'velocity',
          threshold: velocityRule.minOccurrences,
          actual: observedCount,
          unit: 'events',
        });
      }
    }
  }

  return alerts;
}
