// lib/paypal/webhookVerification.ts
// PayPal webhook signature verification.
// Fail-closed: rejects when config or headers are missing, or when
// PayPal's verification API does not confirm the event.
// The verify function is injectable so tests can mock the provider.

import { env } from '@/lib/env';

const REQUIRED_HEADERS = [
  'paypal-auth-algo',
  'paypal-cert-id',
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-webhook-id',
  'paypal-transmission-sig',
] as const;

export interface PayPalWebhookHeaders {
  'paypal-auth-algo': string;
  'paypal-cert-id': string;
  'paypal-transmission-id': string;
  'paypal-transmission-time': string;
  'paypal-webhook-id': string;
  'paypal-transmission-sig': string;
}

export interface PayPalVerificationResult {
  verified: boolean;
  reason?: string;
}

export type VerifyPayPalSignature = (
  headers: PayPalWebhookHeaders,
  body: string,
) => Promise<PayPalVerificationResult>;

const PAYPAL_VERIFY_URL =
  'https://api-m.paypal.com/v1/notifications/verify-webhook-signature';

/**
 * Default implementation: verifies against PayPal's API using client
 * credentials for a bearer token. Requires PAYPAL_CLIENT_ID and
 * PAYPAL_CLIENT_SECRET to be configured.
 */
async function defaultVerifyPayPalSignature(
  headers: PayPalWebhookHeaders,
  body: string,
): Promise<PayPalVerificationResult> {
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  const webhookId = env.PAYPAL_WEBHOOK_ID;

  if (!clientId || !clientSecret || !webhookId) {
    return { verified: false, reason: 'paypal config not configured' };
  }

  // Obtain bearer token from PayPal
  let token: string | undefined;
  try {
    const tokenRes = await fetch(
      'https://api-m.paypal.com/v1/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${clientId}:${clientSecret}`,
          ).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      },
    );
    if (!tokenRes.ok) {
      return { verified: false, reason: 'paypal token request failed' };
    }
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    token = tokenData.access_token;
    if (!token) {
      return { verified: false, reason: 'paypal token missing' };
    }
  } catch {
    return { verified: false, reason: 'paypal token request error' };
  }

  // Verify webhook signature
  const verifyPayload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_id: headers['paypal-cert-id'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: headers['paypal-webhook-id'],
    webhook_event: JSON.parse(body),
  };

  try {
    const verifyRes = await fetch(PAYPAL_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(verifyPayload),
    });
    if (!verifyRes.ok) {
      return { verified: false, reason: 'paypal verify request failed' };
    }
    const data = (await verifyRes.json()) as {
      verification_status?: string;
    };
    return {
      verified: data.verification_status === 'SUCCESS',
      reason: data.verification_status === 'SUCCESS'
        ? undefined
        : `paypal verification status: ${data.verification_status}`,
    };
  } catch {
    return { verified: false, reason: 'paypal verify request error' };
  }
}

/**
 * Verify a PayPal webhook event. Fail-closed: returns verified:false when
 * config is missing, headers are incomplete, or PayPal does not confirm.
 *
 * @param headers — Incoming request headers (lowercased keys).
 * @param body — Raw request body string.
 * @param verify — Injectable verification function (defaults to PayPal API).
 */
export async function verifyPayPalWebhook(
  headers: Record<string, string | undefined>,
  body: string,
  verify: VerifyPayPalSignature = defaultVerifyPayPalSignature,
): Promise<PayPalVerificationResult> {
  // Fail closed: config must be present (read at runtime, not import time)
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return { verified: false, reason: 'PAYPAL_WEBHOOK_ID not configured' };
  }

  // Fail closed: all required headers must be present
  const missing = REQUIRED_HEADERS.filter((h) => !headers[h]);
  if (missing.length > 0) {
    return {
      verified: false,
      reason: `missing paypal headers: ${missing.join(', ')}`,
    };
  }

  const typedHeaders = headers as unknown as PayPalWebhookHeaders;
  // Fail closed: header webhook_id must match configured webhook_id
  const headerWebhookId = typedHeaders['paypal-webhook-id'];
  if (!headerWebhookId || headerWebhookId !== webhookId) {
    return {
      verified: false,
      reason: 'paypal webhook_id mismatch',
    };
  }

  return verify(typedHeaders, body);
}
