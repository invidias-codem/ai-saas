/**
 * lib/telemetry/cliStreamRegistry.ts
 *
 * Module-level registry of active CLI SSE streams.
 *
 * Allows the watcher / alert injector to push `event: alert` chunks
 * into currently-open /api/cli/stream connections without coupling
 * the stream handler to the alerting layer.
 */

type StreamHandle = {
  traceId: string;
  userId: string;
  taskId?: string;
  send: (event: string, data: any) => void;
  close: () => void;
};

const activeStreams = new Map<string, StreamHandle>();

export function registerStream(handle: StreamHandle): void {
  activeStreams.set(handle.traceId, handle);
}

export function unregisterStream(traceId: string): void {
  activeStreams.delete(traceId);
}

export function getActiveStreams(): StreamHandle[] {
  return Array.from(activeStreams.values());
}

export function broadcastAlert(payload: {
  severity: 'warn' | 'critical';
  event_type: string;
  reason: string;
  actual: number;
  threshold: number;
  unit: string;
  message?: string;
}): number {
  let sent = 0;
  for (const stream of activeStreams.values()) {
    try {
      stream.send('alert', {
        ...payload,
        traceId: stream.traceId,
        timestamp: Date.now(),
      });
      sent++;
    } catch {
      // Stream already closed; clean up on next unregister.
    }
  }
  return sent;
}
