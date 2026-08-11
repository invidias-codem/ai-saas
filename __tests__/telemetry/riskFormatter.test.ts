/**
 * Offline unit tests for `lib/telemetry/riskFormatter.ts`.
 *
 * Pure rendering tests — no network, no Supabase, no subprocess execution.
 * Cross-platform safe: line endings normalized.
 */

import { formatUsd, Metric, renderTable, colorForSeverity } from '../../lib/telemetry/riskFormatter';

const FIXTURE_METRICS: Metric[] = [
  {
    event_type: 'unauthorized_tool_attempt',
    total_occurrences_30d: 12,
    projected_aro: 146.0,
    current_ale_usd: 730000,
    severity: 'critical',
  },
  {
    event_type: 'provider_fallback',
    total_occurrences_30d: 8,
    projected_aro: 97.33,
    current_ale_usd: 4.87,
    severity: 'low',
  },
  {
    event_type: 'circuit_breaker_trip',
    total_occurrences_30d: 1,
    projected_aro: 12.17,
    current_ale_usd: 12.17,
    severity: 'medium',
  },
];

describe('riskFormatter', () => {
  test('colorForSeverity returns terminal control strings for known severities', () => {
    expect(colorForSeverity('critical')).toContain('\x1b[');
    expect(colorForSeverity('high')).toContain('\x1b[');
    expect(colorForSeverity('medium')).toContain('\x1b[');
    expect(colorForSeverity('low')).toContain('\x1b[');
    expect(colorForSeverity('unknown')).toBe('\x1b[0m');
  });

  test('formatUsd formats large/small values correctly', () => {
    expect(formatUsd(730000)).toBe('$730,000.00');
    expect(formatUsd(4.87)).toBe('$4.87');
    expect(formatUsd(0.0034)).toBe('$0.0034');
  });

  test('renderTable emits table with footer, sorted columns, and normalized line endings', () => {
    const output = renderTable(FIXTURE_METRICS).replace(/\r\n/g, '\n');

    // Structural assertions
    expect(output).toContain('Event Type');
    expect(output).toContain('30d Count');
    expect(output).toContain('Proj. ARO');
    expect(output).toContain('Current ALE');
    expect(output).toContain('Severity');
    expect(output).toContain('Total Platform Risk (30d ALE)');

    // Presence of expected values
    expect(output).toContain('unauthorized_tool_attempt');
    expect(output).toContain('provider_fallback');
    expect(output).toContain('circuit_breaker_trip');
    expect(output).toContain('$730,000.00');
    expect(output).toContain('$4.87');
    expect(output).toContain('$12.17');

    // Footer total
    expect(output).toContain('Total Platform Risk (30d ALE): $730,017.04');
  });

  test('renderTable is deterministic for empty metrics', () => {
    const output = renderTable([]).replace(/\r\n/g, '\n');
    expect(output).toContain('Total Platform Risk (30d ALE): $0.00');
    expect(output).toContain('Event Type');
  });
});
