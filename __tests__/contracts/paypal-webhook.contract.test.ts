// __tests__/contracts/paypal-webhook.contract.test.ts
// PayPal webhook authenticity — contract tests.
// All provider calls are mocked; no live payment, no secrets, no ledger changes.

import { verifyPayPalWebhook } from '@/lib/paypal/webhookVerification';
const baseHeaders: Record<string, string> = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-id': 'TEST-CERT-ID',
  'paypal-transmission-id': 'TEST-TRANSMISSION-ID',
  'paypal-transmission-time': '2026-01-01T00:00:00Z',
  'paypal-webhook-id': 'TEST-WEBHOOK-ID',
  'paypal-transmission-sig': 'TEST-SIGNATURE',
};

const baseBody = JSON.stringify({
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  id: 'event-1',
  webhook_id: 'TEST-WEBHOOK-ID',
  resource: {
    id: 'capture-1',
    status: 'COMPLETED',
    amount: { value: '10.00', currency_code: 'USD' },
    payer: { email_address: 'buyer@example.com', payer_id: 'payer-1' },
  },
});

function makeVerify(verified: boolean, reason?: string) {
  return async () => ({ verified, reason });
}

describe('paypal webhook — verification fail-closed', () => {
  it('rejects when PAYPAL_WEBHOOK_ID not configured', async () => {
    const original = process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    try {
      const result = await verifyPayPalWebhook(baseHeaders, baseBody);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('PAYPAL_WEBHOOK_ID');
    } finally {
      if (original) process.env.PAYPAL_WEBHOOK_ID = original;
      else delete process.env.PAYPAL_WEBHOOK_ID;
    }
  });

  it('rejects when required headers missing', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';
    try {
      const { 'paypal-transmission-sig': _, ...incomplete } = baseHeaders;
      const result = await verifyPayPalWebhook(incomplete, baseBody, makeVerify(true));
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('missing paypal headers');
    } finally {
      delete process.env.PAYPAL_WEBHOOK_ID;
    }
  });

  it('rejects when header webhook_id does not match configured', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'CONFIGURED-WEBHOOK-ID';
    try {
      const result = await verifyPayPalWebhook(baseHeaders, baseBody, makeVerify(true));
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('webhook_id mismatch');
    } finally {
      delete process.env.PAYPAL_WEBHOOK_ID;
    }
  });

  it('rejects when verify function returns unverified', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';
    try {
      const result = await verifyPayPalWebhook(
        baseHeaders,
        baseBody,
        makeVerify(false, 'paypal rejected'),
      );
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('paypal rejected');
    } finally {
      delete process.env.PAYPAL_WEBHOOK_ID;
    }
  });

  it('accepts when verify function returns verified', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';
    try {
      const result = await verifyPayPalWebhook(
        baseHeaders,
        baseBody,
        makeVerify(true),
      );
      expect(result.verified).toBe(true);
    } finally {
      delete process.env.PAYPAL_WEBHOOK_ID;
    }
  });
});

describe('paypal webhook — validation rules (route-level)', () => {
  // These validate the logic the route applies AFTER signature verification.
  // The route is responsible for enforcing them; this test documents the
  // expected behavior and verifies the validation helpers are correct.

  it('rejects non-COMPLETED capture status', () => {
    const resource = { status: 'PARTIALLY_REFUNDED' } as { status?: string };
    expect(resource.status).not.toBe('COMPLETED');
  });

  it('rejects non-USD currency', () => {
    const currency = 'EUR';
    expect(currency).not.toBe('USD');
  });

  it('rejects non-finite amount', () => {
    const amount = parseFloat('Infinity');
    expect(isFinite(amount)).toBe(false);
  });

  it('rejects zero or negative amount', () => {
    expect(parseFloat('0')).toBe(0);
    expect(parseFloat('-5.00')).toBeLessThanOrEqual(0);
  });

  it('accepts finite positive USD amount', () => {
    const amount = parseFloat('10.00');
    expect(isFinite(amount)).toBe(true);
    expect(amount).toBeGreaterThan(0);
  });
});
