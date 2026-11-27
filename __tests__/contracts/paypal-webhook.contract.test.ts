// __tests__/contracts/paypal-webhook.contract.test.ts
// PayPal webhook authenticity — contract tests.
// Tests the default verification provider path with mocked fetch, and
// real route-handler behavior asserting no Clerk/Supabase credit mutations
// for unauthenticated or invalid events. No live payment calls.
// All PayPal API calls are mocked; real sandbox qualification is separate.

process.env.PAYPAL_CLIENT_ID = 'test-client-id';
process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';

import { NextRequest } from "next/server";
import { verifyPayPalWebhook } from '@/lib/paypal/webhookVerification';

// Documented PayPal capture-completed webhook payload.
// Per PayPal developer docs, capture-completed events do NOT include
// resource.payer. The webhook_id is sourced from server config, not headers.
const baseHeaders: Record<string, string> = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api-m.paypal.com/test-cert',
  'paypal-transmission-id': 'TEST-TRANSMISSION-ID',
  'paypal-transmission-time': '2026-01-01T00:00:00Z',
  'paypal-transmission-sig': 'TEST-SIGNATURE',
};

const baseBody = JSON.stringify({
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  id: 'event-1',
  resource: {
    id: 'capture-1',
    status: 'COMPLETED',
    amount: { value: '10.00', currency_code: 'USD' },
    payee: { merchant_id: 'EXPECTED-MERCHANT-ID', email: 'merchant@example.com' },
  },
});

function makeVerify(verified: boolean, reason?: string) {
  return async () => ({ verified, reason });
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

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

  it('rejects when PAYPAL_CLIENT_ID not configured', async () => {
    const original = process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_ID;
    try {
      const result = await verifyPayPalWebhook(baseHeaders, baseBody);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('paypal config not configured');
    } finally {
      if (original) process.env.PAYPAL_CLIENT_ID = original;
      else delete process.env.PAYPAL_CLIENT_ID;
    }
  });

  it('rejects when PAYPAL_CLIENT_SECRET not configured', async () => {
    const original = process.env.PAYPAL_CLIENT_SECRET;
    delete process.env.PAYPAL_CLIENT_SECRET;
    try {
      const result = await verifyPayPalWebhook(baseHeaders, baseBody);
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('paypal config not configured');
    } finally {
      if (original) process.env.PAYPAL_CLIENT_SECRET = original;
      else delete process.env.PAYPAL_CLIENT_SECRET;
    }
  });

  it('rejects when required transmission headers missing', async () => {
    const { 'paypal-transmission-sig': _, ...incomplete } = baseHeaders;
    const result = await verifyPayPalWebhook(incomplete, baseBody, makeVerify(true));
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('missing paypal headers');
  });

  it('accepts legitimate delivery without paypal-webhook-id header', async () => {
    // PayPal protocol: webhook_id comes from server config, not incoming headers.
    const { 'paypal-webhook-id': _, ...headersNoWebhookId } = baseHeaders;
    const result = await verifyPayPalWebhook(headersNoWebhookId, baseBody, makeVerify(true));
    expect(result.verified).toBe(true);
  });

  it('rejects when verify function returns unverified', async () => {
    const result = await verifyPayPalWebhook(
      baseHeaders,
      baseBody,
      makeVerify(false, 'paypal rejected'),
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe('paypal rejected');
  });

  it('accepts when verify function returns verified', async () => {
    const result = await verifyPayPalWebhook(
      baseHeaders,
      baseBody,
      makeVerify(true),
    );
    expect(result.verified).toBe(true);
  });
});

describe('paypal webhook — default provider path (mocked fetch)', () => {
  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';
    process.env.PAYPAL_CLIENT_ID = 'test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  });

  it('sends exact verification fields to PayPal API', async () => {
    const fetchCalls: Array<{ url: string; body: Record<string, unknown> | null; headers: Record<string, string> }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(
      (async (_url: string, _init: any) => {
        const url = String(_url);
        const init = _init as { body?: string; headers?: Record<string, string> };
        let body: Record<string, unknown> | null = null;
        if (init.body) {
          try { body = JSON.parse(init.body); } catch { body = { raw: init.body }; }
        }
        fetchCalls.push({ url, body, headers: init.headers ?? {} });
        if (url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any,
    );

    const result = await verifyPayPalWebhook(baseHeaders, baseBody);
    expect(result.verified).toBe(true);

    // Token request
    expect(fetchCalls[0].url).toBe('https://api-m.paypal.com/v1/oauth2/token');
    expect(fetchCalls[0].headers.Authorization).toContain('Basic');

    // Verify request
    expect(fetchCalls[1].url).toBe('https://api-m.paypal.com/v1/notifications/verify-webhook-signature');
    const verifyBody = fetchCalls[1].body;
    expect(verifyBody).not.toBeNull();
    expect(verifyBody!.webhook_id).toBe('TEST-WEBHOOK-ID');
    expect(verifyBody!.cert_url).toBe('https://api-m.paypal.com/test-cert');
    expect(verifyBody!.transmission_sig).toBe('TEST-SIGNATURE');
    expect(verifyBody!.transmission_id).toBe('TEST-TRANSMISSION-ID');
    expect(verifyBody!.transmission_time).toBe('2026-01-01T00:00:00Z');
    expect(verifyBody!.auth_algo).toBe('SHA256withRSA');
    expect((verifyBody as { webhook_event: { event_type: string } }).webhook_event.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
    expect(fetchCalls[1].headers.Authorization).toContain('Bearer');
  });

  it('rejects when PayPal returns non-SUCCESS status', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (async (_url: string) => {
        const url = String(_url);
        if (url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ verification_status: 'FAILURE' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any,
    );

    const result = await verifyPayPalWebhook(baseHeaders, baseBody);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('FAILURE');
  });

  it('rejects when token request fails', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (async (url: string) => {
        if (String(url).includes('/token')) {
          return new Response('error', { status: 400 });
        }
        return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 });
      }) as any,
    );

    const result = await verifyPayPalWebhook(baseHeaders, baseBody);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('token');
  });

  it('rejects when fetch times out', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('AbortSignal timed out'));

    const result = await verifyPayPalWebhook(baseHeaders, baseBody);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('error');
  });

  it('rejects when PayPal returns malformed JSON', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (async (_url: string) => {
        const url = String(_url);
        if (url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as any,
    );

    const result = await verifyPayPalWebhook(baseHeaders, baseBody);
    expect(result.verified).toBe(false);
  });
});

// Supabase mock for idempotency and no-credit assertions
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@supabase/supabase-js";
const mockCreateClient = jest.mocked(createClient);

describe('paypal webhook — route handler (fail-closed, no credits without S8)', () => {
  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = 'TEST-WEBHOOK-ID';
    process.env.PAYPAL_CLIENT_ID = 'test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
    process.env.PAYPAL_MERCHANT_ID = 'EXPECTED-MERCHANT-ID';
    mockCreateClient.mockReset();
  });

  async function postWebhook(body: string, customHeaders?: Record<string, string>) {
    const { POST } = await import('@/app/api/webhooks/paypal/route');
    const headers: Record<string, string> = customHeaders
      ? { 'content-type': 'application/json', ...customHeaders }
      : { 'content-type': 'application/json', ...baseHeaders };
    const req = new NextRequest('https://example.com/api/webhooks/paypal', {
      method: 'POST',
      headers,
      body,
    });
    return POST(req);
  }

  function mockProvider(verificationStatus: 'SUCCESS' | 'FAILURE' = 'SUCCESS') {
    jest.spyOn(global, 'fetch').mockImplementation(
      (async (_url: string) => {
        const url = String(_url);
        if (url.includes('/token')) {
          return new Response(JSON.stringify({ access_token: 'test-access-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ verification_status: verificationStatus }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as any,
    );
  }

  function mockSupabaseInsert(result: { error: null } | { error: { code: string } }) {
    const mockInsert = jest.fn().mockResolvedValue(result);
    const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });
    mockCreateClient.mockReturnValue({ from: mockFrom } as any);
    return mockInsert;
  }

  it('returns 401 without Clerk/Supabase when signature verification fails', async () => {
    mockProvider('FAILURE');
    const res = await postWebhook(baseBody);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Webhook verification failed');
  });

  it('returns 401 when provider throws (network failure)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await postWebhook(baseBody);
    expect(res.status).toBe(401);
  });

  it('returns 401 when PAYPAL_WEBHOOK_ID not configured', async () => {
    const original = process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    try {
      const res = await postWebhook(baseBody);
      expect(res.status).toBe(401);
    } finally {
      process.env.PAYPAL_WEBHOOK_ID = original;
    }
  });

  it('returns 401 when required PayPal headers missing', async () => {
    mockProvider('SUCCESS');
    const headersNoSig: Record<string, string> = {};
    for (const [k, v] of Object.entries(baseHeaders)) {
      if (k !== 'paypal-transmission-sig') headersNoSig[k] = v;
    }
    const res = await postWebhook(baseBody, headersNoSig);
    expect(res.status).toBe(401);
  });

  it('returns 200 for non-capture event types (ignored)', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      event_type: 'PAYMENT.AUTHORIZATION.CREATED',
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(200);
  });

  it('returns 400 for non-COMPLETED capture status', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: { ...JSON.parse(baseBody).resource, status: 'PARTIALLY_REFUNDED' },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-USD currency', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        amount: { value: '10.00', currency_code: 'EUR' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed monetary value (partially numeric)', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        amount: { value: '10abc', currency_code: 'USD' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative amount', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        amount: { value: '-5.00', currency_code: 'USD' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for zero amount', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        amount: { value: '0.00', currency_code: 'USD' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 for amount over $10,000 cap', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        amount: { value: '15000.00', currency_code: 'USD' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when merchant/beneficiary binding missing (no payee)', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: { ...JSON.parse(baseBody).resource, payee: undefined },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Merchant/beneficiary');
  });

  it('returns 400 when merchant ID does not match configured', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: {
        ...JSON.parse(baseBody).resource,
        payee: { ...JSON.parse(baseBody).resource.payee, merchant_id: 'WRONG-MERCHANT' },
      },
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when merchant configuration missing (fail-closed)', async () => {
    mockProvider('SUCCESS');
    const original = process.env.PAYPAL_MERCHANT_ID;
    delete process.env.PAYPAL_MERCHANT_ID;
    try {
      const res = await postWebhook(baseBody);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Merchant configuration missing');
    } finally {
      process.env.PAYPAL_MERCHANT_ID = original;
    }
  });

  it('returns 400 when capture ID missing (no fallback to webhook event ID)', async () => {
    mockProvider('SUCCESS');
    const body = JSON.stringify({
      ...JSON.parse(baseBody),
      resource: { ...JSON.parse(baseBody).resource, id: undefined },
      id: 'event-1',
    });
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
  });

  it('returns 402 settlement pending S8 when all validation passes (no credits issued)', async () => {
    mockProvider('SUCCESS');
    mockSupabaseInsert({ error: null });
    const res = await postWebhook(baseBody);
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.status).toContain('Settlement pending S8');
    // No credit mutation: insert was called once for idempotency, not for credits
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it('detects duplicate delivery with two handler invocations (idempotent replay)', async () => {
    mockProvider('SUCCESS');
    const mockInsert = mockSupabaseInsert({ error: null });
    mockInsert.mockResolvedValueOnce({ error: null });      // first: insert succeeds
    mockInsert.mockResolvedValueOnce({ error: { code: '23505' } }); // second: duplicate

    // First delivery
    const res1 = await postWebhook(baseBody);
    expect(res1.status).toBe(402); // settlement pending, insert succeeded

    // Second delivery (duplicate)
    const res2 = await postWebhook(baseBody);
    expect(res2.status).toBe(200); // already processed, no double credit

    // Explicit mutation assertions: insert called exactly twice, same transaction ID
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockInsert).toHaveBeenCalledWith({ transaction_id: 'capture-1', amount: '10 USD' });
  });

  it('does not credit when Supabase unavailable after verification', async () => {
    mockProvider('SUCCESS');
    // createClient returns undefined (default jest.fn() return) → insert throws → 500
    const res = await postWebhook(baseBody);
    expect(res.status).toBe(500);
  });
});
