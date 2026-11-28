/**
 * Offline unit tests for `lib/telemetry/cliStreamRegistry.ts`.
 *
 * Validates register/unregister/broadcast behavior without network.
 */

import { registerStream, unregisterStream, broadcastAlert, getActiveStreams } from '@/lib/telemetry/cliStreamRegistry';

describe('cliStreamRegistry', () => {
  afterEach(() => {
    // Clean up all streams after each test
    for (const stream of getActiveStreams()) {
      unregisterStream(stream.traceId);
    }
  });

  test('registers and retrieves active streams', () => {
    const traceId = 'trace-123';
    const send = jest.fn();
    const close = jest.fn();

    registerStream({
      traceId,
      userId: 'user-1',
      taskId: 'task-1',
      send,
      close,
    });

    const streams = getActiveStreams();
    expect(streams).toHaveLength(1);
    expect(streams[0].traceId).toBe('trace-123');
    expect(streams[0].userId).toBe('user-1');
  });

  test('unregisters stream by traceId', () => {
    registerStream({
      traceId: 'trace-456',
      userId: 'user-2',
      taskId: 'task-2',
      send: jest.fn(),
      close: jest.fn(),
    });

    expect(getActiveStreams()).toHaveLength(1);

    unregisterStream('trace-456');

    expect(getActiveStreams()).toHaveLength(0);
  });

  test('broadcastAlert sends alert to all registered streams', () => {
    const send1 = jest.fn();
    const send2 = jest.fn();

    registerStream({
      traceId: 'trace-a',
      userId: 'user-a',
      taskId: 'task-a',
      send: send1,
      close: jest.fn(),
    });

    registerStream({
      traceId: 'trace-b',
      userId: 'user-b',
      taskId: 'task-b',
      send: send2,
      close: jest.fn(),
    });

    const sent = broadcastAlert({
      severity: 'critical',
      event_type: 'context_firewall_deny',
      reason: 'velocity',
      actual: 6,
      threshold: 5,
      unit: 'events',
    });

    expect(sent).toBe(2);

    expect(send1).toHaveBeenCalledTimes(1);
    const [event1, data1] = send1.mock.calls[0];
    expect(event1).toBe('alert');
    expect(data1.traceId).toBe('trace-a');
    expect(data1.severity).toBe('critical');
    expect(data1.event_type).toBe('context_firewall_deny');
    expect(data1.actual).toBe(6);
    expect(data1.timestamp).toBeDefined();

    expect(send2).toHaveBeenCalledTimes(1);
    const [event2, data2] = send2.mock.calls[0];
    expect(event2).toBe('alert');
    expect(data2.traceId).toBe('trace-b');
    expect(data2.reason).toBe('velocity');
  });

  test('broadcastAlert does not throw when stream send fails', () => {
    const failingSend = jest.fn().mockImplementation(() => {
      throw new Error('stream closed');
    });

    registerStream({
      traceId: 'trace-bad',
      userId: 'user-bad',
      taskId: 'task-bad',
      send: failingSend,
      close: jest.fn(),
    });

    // Should not throw even if stream send fails
    expect(() => broadcastAlert({
      severity: 'warn',
      event_type: 'test_event',
      reason: 'financial',
      actual: 1,
      threshold: 10,
      unit: 'usd',
    })).not.toThrow();
  });

  test('broadcastAlert returns zero when no streams are registered', () => {
    expect(getActiveStreams()).toHaveLength(0);

    const sent = broadcastAlert({
      severity: 'critical',
      event_type: 'context_firewall_deny',
      reason: 'velocity',
      actual: 99,
      threshold: 1,
      unit: 'events',
    });

    expect(sent).toBe(0);
  });
});
