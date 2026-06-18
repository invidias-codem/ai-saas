/**
 * Partner webhook delivery system.
 *
 * Signs payloads with HMAC-SHA256 and POSTs them to partner-registered
 * webhook URLs. Retries up to 3 times with exponential backoff.
 *
 * Usage:
 *   await deliverWebhook(keyId, 'memory.created', { memoryId, content });
 */

import { createHmac, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';

export type WebhookEvent =
  | 'memory.created'
  | 'memory.deleted'
  | 'key.revoked'
  | 'query.executed'
  | 'stream.started';

interface WebhookSubscription {
  id: string;
  endpoint_url: string;
  signing_secret: string;
  events: string[];
  active: boolean;
}

/**
 * Generate a webhook signing secret (shown once at creation).
 */
export function generateSigningSecret(): string {
  return `lwhsec_${randomBytes(24).toString('hex')}`;
}

/**
 * Sign a webhook payload. The partner verifies by:
 *   1. Computing HMAC-SHA256 of raw body with their signing_secret
 *   2. Comparing to the X-Lattice-Signature header
 */
function signPayload(body: string, secret: string, timestamp: number): string {
  const signedContent = `${timestamp}.${body}`;
  return `v1=${createHmac('sha256', secret).update(signedContent).digest('hex')}`;
}

/**
 * Deliver a webhook event to all active subscriptions for a partner key.
 * Fire-and-forget — never blocks the originating API response.
 */
export async function deliverWebhook(
  keyId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    const { data: webhooks, error } = await supabaseAdmin
      .from('partner_webhooks')
      .select('id, endpoint_url, signing_secret, events, active')
      .eq('key_id', keyId)
      .eq('active', true);

    if (error || !webhooks || webhooks.length === 0) return;

    for (const hook of webhooks as WebhookSubscription[]) {
      // Check if this webhook is subscribed to this event
      const listensToAll = hook.events.includes('*');
      const listensToEvent = hook.events.includes(event);
      if (!listensToAll && !listensToEvent) continue;

      void deliverToEndpoint(hook, event, payload);
    }
  } catch (err) {
    console.error('[webhook] failed to fetch subscriptions:', err);
  }
}

async function deliverToEndpoint(
  hook: WebhookSubscription,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(body, hook.signing_secret, timestamp);

    const start = Date.now();
    let success = false;
    let responseStatus: number | null = null;
    let responseBody = '';

    try {
      const resp = await fetch(hook.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Lattice-Event': event,
          'X-Lattice-Signature': signature,
          'X-Lattice-Timestamp': String(timestamp),
          'User-Agent': 'LatticeOS-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      responseStatus = resp.status;
      responseBody = (await resp.text()).slice(0, 2048);
      success = resp.ok;
    } catch (err) {
      responseBody = err instanceof Error ? err.message : 'unknown error';
    }

    const durationMs = Date.now() - start;

    // Log the attempt
    if (supabaseAdmin) {
      void supabaseAdmin.from('partner_webhook_log').insert({
        webhook_id: hook.id,
        event_type: event,
        payload_body: { event, data: payload },
        response_status: responseStatus,
        response_body: responseBody,
        duration_ms: durationMs,
        success,
        attempt_number: attempt,
      });
    }

    if (success) return;

    // Exponential backoff: 2s, 4s, 8s
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  // All attempts failed — could trigger an alert here in the future
  console.warn(`[webhook] all ${maxAttempts} attempts failed for ${hook.endpoint_url} (${event})`);
}
