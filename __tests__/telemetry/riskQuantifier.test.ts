import { buildRiskEvent, RiskEvent } from '@/lib/telemetry/riskQuantifier';

describe('Risk Quantifier', () => {
  test('builds ALE proxy from SLE and ARO weights', () => {
    const event = buildRiskEvent({
      eventType: 'unauthorized_tool_attempt',
      traceId: 'trace-123',
      workspaceId: 'ws-1',
      userId: 'user-1',
      metadata: { toolName: 'raw_shell' },
    });

    expect(event.sle_weight).toBe(8);
    expect(event.aro_weight).toBe(2);
    expect(event.ale_proxy).toBe(16);
    expect(event.event_type).toBe('unauthorized_tool_attempt');
    expect(event.trace_id).toBe('trace-123');
    expect(event.workspace_id).toBe('ws-1');
    expect(event.user_id).toBe('user-1');
    expect(event.metadata).toEqual({ toolName: 'raw_shell' });
  });

  test('defaults metadata and optional ids when omitted', () => {
    const event = buildRiskEvent({ eventType: 'circuit_breaker_trip' });

    expect(event.metadata).toEqual({});
    expect(event.trace_id).toBeUndefined();
    expect(event.workspace_id).toBeUndefined();
    expect(event.user_id).toBeUndefined();
    expect(event.ale_proxy).toBe(5);
  });

  test('falls back to weight 1 for unknown event types', () => {
    const event = buildRiskEvent({ eventType: 'unknown_event' as any });

    expect(event.sle_weight).toBe(1);
    expect(event.aro_weight).toBe(1);
    expect(event.ale_proxy).toBe(1);
  });

  test('includes ISO timestamp', () => {
    const before = new Date();
    const event = buildRiskEvent({ eventType: 'provider_fallback' });
    const after = new Date();

    const occurred = new Date(event.occurred_at);
    expect(occurred.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(occurred.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
