/**
 * Offline integration test for `scripts/lattice-watcher.ts` transport layer.
 *
 * Validates:
 * - `evaluateThresholds` with watcher-style fixture payloads
 * - `dispatchSlackAlert` using mocked global.fetch
 */

import { dispatchSlackAlert } from '@/lib/telemetry/alertTransport';
import { evaluateThresholds, type Metric } from '@/lib/telemetry/thresholdEvaluator';
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
];

describe('lattice-watcher integration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  test('evaluator produces same alerts as watcher would see', () => {
    const alerts = evaluateThresholds(FIXTURE_METRICS, DEFAULT_ALERT_RULES);
    const unauthorized = alerts.find((a) => a.event_type === 'unauthorized_tool_attempt');
    expect(unauthorized).toBeDefined();
    expect(unauthorized!.reason).toBe('financial');
    expect(unauthorized!.actual).toBe(730000);
    expect(unauthorized!.severity).toBe('critical');
  });

  test('dispatchSlackAlert sends formatted payload and handles HTTP errors', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    global.fetch = mockFetch;

    await dispatchSlackAlert({
      webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK',
      eventType: 'unauthorized_tool_attempt',
      severity: 'critical',
      reason: 'financial',
      actual: 730000,
      threshold: 500,
      unit: 'usd',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options!.body as string);
    expect(body.text).toContain('CRITICAL');
    expect(body.text).toContain('unauthorized_tool_attempt');
    expect(body.text).toContain('Actual: 730000 usd');
    expect(body.text).toContain('Threshold: 500 usd');
  });

  test('dispatchSlackAlert logs on non-OK response without throwing', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response);

    global.fetch = mockFetch;

    await dispatchSlackAlert({
      webhookUrl: 'https://hooks.slack.com/services/TEST/WEBHOOK',
      eventType: 'context_firewall_deny',
      severity: 'warn',
      reason: 'velocity',
      actual: 6,
      threshold: 5,
      unit: 'events',
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
