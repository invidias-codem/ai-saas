/**
 * lib/telemetry/alertTransport.ts
 *
 * Alert dispatch interfaces for the watcher cron.
 *
 * Supported transports:
 *  - Slack webhook
 *  - Internal SSE injection endpoint
 */

export interface SlackAlertPayload {
  text: string;
  blocks?: Array<Record<string, unknown>>;
}

export async function dispatchSlackAlert(input: {
  webhookUrl: string;
  eventType: string;
  severity: 'warn' | 'critical';
  reason: 'velocity' | 'financial';
  actual: number;
  threshold: number;
  unit: string;
}): Promise<void> {
  const { webhookUrl, eventType, severity, reason, actual, threshold, unit } = input;

  const emoji = severity === 'critical' ? ':rotating_light:' : ':warning:';
  const text = `${emoji} *${severity.toUpperCase()}*: ${eventType} threshold breached\nReason: ${reason}\nActual: ${actual} ${unit}\nThreshold: ${threshold} ${unit}`;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text } satisfies SlackAlertPayload),
    });

    if (!res.ok) {
      console.error(`[alertTransport] Slack webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error('[alertTransport] Slack webhook error:', err);
  }
}
