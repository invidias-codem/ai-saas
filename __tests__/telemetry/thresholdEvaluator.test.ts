/**
 * Offline unit tests for `lib/telemetry/thresholdEvaluator.ts`.
 *
 * Pure function tests with fixture payloads matching /api/risk/ale shape.
 */

import { evaluateThresholds, Metric, Alert } from '@/lib/telemetry/thresholdEvaluator';
import { DEFAULT_ALERT_RULES } from '@/lib/telemetry/alertConfig';

const FIXTURE_METRICS: Metric[] = [
  {
    event_type: 'unauthorized_tool_attempt',
    total_occurrences_30d: 12,
    projected_aro: 146.0,
    current_ale_usd: 730000,
    severity: 'critical',
    recentWindowCount: 8,
    windowMinutes: 15,
  },
  {
    event_type: 'provider_fallback',
    total_occurrences_30d: 8,
    projected_aro: 97.33,
    current_ale_usd: 4.87,
    severity: 'low',
    recentWindowCount: 1,
    windowMinutes: 15,
  },
  {
    event_type: 'circuit_breaker_trip',
    total_occurrences_30d: 1,
    projected_aro: 12.17,
    current_ale_usd: 12.17,
    severity: 'medium',
    recentWindowCount: 8,
    windowMinutes: 15,
  },
  {
    event_type: 'context_firewall_deny',
    total_occurrences_30d: 20,
    projected_aro: 243.33,
    current_ale_usd: 12166.5,
    severity: 'high',
    recentWindowCount: 6,
    windowMinutes: 15,
  },
];

describe('thresholdEvaluator', () => {
  test('fires critical financial alert when current_ale_usd exceeds threshold', () => {
    const alerts = evaluateThresholds(FIXTURE_METRICS, DEFAULT_ALERT_RULES);
    const unauthorized = alerts.find((a) => a.event_type === 'unauthorized_tool_attempt' && a.reason === 'financial');
    expect(unauthorized).toBeDefined();
    expect(unauthorized!.severity).toBe('critical');
    expect(unauthorized!.actual).toBe(730000);
    expect(unauthorized!.threshold).toBe(500);
  });

  test('fires critical velocity alert when recentWindowCount exceeds threshold', () => {
    const alerts = evaluateThresholds(FIXTURE_METRICS, DEFAULT_ALERT_RULES);
    const circuitBreaker = alerts.find((a) => a.event_type === 'circuit_breaker_trip' && a.reason === 'velocity');
    expect(circuitBreaker).toBeDefined();
    expect(circuitBreaker!.severity).toBe('critical');
    expect(circuitBreaker!.actual).toBe(8);
    expect(circuitBreaker!.threshold).toBe(4);
  });

  test('does not fire alert when metric is within thresholds', () => {
    const alerts = evaluateThresholds(FIXTURE_METRICS, DEFAULT_ALERT_RULES);
    const providerFallback = alerts.find((a) => a.event_type === 'provider_fallback');
    expect(providerFallback).toBeUndefined();
  });

  test('falls back to 30d count when recentWindowCount is missing', () => {
    const metricsWithoutWindow: Metric[] = [
      {
        event_type: 'context_firewall_deny',
        total_occurrences_30d: 20,
        projected_aro: 243.33,
        current_ale_usd: 12166.5,
        severity: 'high',
      },
    ];
    const alerts = evaluateThresholds(metricsWithoutWindow, DEFAULT_ALERT_RULES);
    const deny = alerts.find((a) => a.event_type === 'context_firewall_deny' && a.reason === 'velocity');
    expect(deny).toBeDefined();
    expect(deny!.actual).toBe(20);
  });

  test('returns empty array when no thresholds are breached', () => {
    const safeMetrics: Metric[] = [
      {
        event_type: 'provider_fallback',
        total_occurrences_30d: 1,
        projected_aro: 12.17,
        current_ale_usd: 0.1,
        severity: 'low',
        recentWindowCount: 1,
        windowMinutes: 15,
      },
    ];
    const alerts = evaluateThresholds(safeMetrics, DEFAULT_ALERT_RULES);
    expect(alerts).toHaveLength(0);
  });
});
