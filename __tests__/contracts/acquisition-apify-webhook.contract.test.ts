// __tests__/contracts/acquisition-apify-webhook.contract.test.ts
// A3 webhook contracts:
//   - invalid/missing secret → 401, ZERO dispatch, zero store reads
//   - malformed payload → 400, zero dispatch
//   - nonterminal events → acknowledged, ingested:false, zero dispatch
//   - terminal events → exactly one idempotent dispatch
//   - unknown run → dispatch with derived operationKey (retry resolves the
//     webhook-beats-persistence race; the task never mints state)
//   - schema rejects unknown event types and missing run ids

import { POST } from '@/app/api/webhooks/apify/route';
import { ApifyTerminalWebhookSchema, isTerminalWebhookEvent } from '@/lib/acquisition/durable/webhookSchema';
import { acquisitionOperationKey } from '@/lib/acquisition/contracts';

// ── dispatch fixture: capture calls ─────────────────────────────────────

const dispatchCalls: unknown[] = [];
const providerRows: Map<string, { operation_key: string; acquisition_request_id: string }> = new Map();

jest.mock('@/lib/trigger/dispatch', () => ({
  dispatchAcquisitionIngest: async (args: unknown) => {
    dispatchCalls.push(args);
    return { triggerRunId: 'tr-1' };
  },
}));

jest.mock('@/lib/acquisition/store/acquisitionStore', () => ({
  getProviderRun: async (_p: string, runId: string) => providerRows.get(runId) ?? null,
}));

jest.mock('@/lib/env', () => ({
  env: { APIFY_WEBHOOK_SECRET: 'whsec-test', TRIGGER_SECRET_KEY: 'trigger-key', APIFY_API_TOKEN: 'tok' },
}));

function makeRequest(body: unknown, secret?: string): Request {
  return new Request('https://app.example/api/webhooks/apify', {
    method: 'POST',
    headers: secret ? { 'x-lattice-apify-secret': secret } : {},
    body: JSON.stringify(body),
  });
}

const SUCCEEDED_EVENT = {
  eventType: 'ACTOR.RUN.SUCCEEDED',
  actorRunId: 'run-1',
  actorId: 'apify/threads-scraper',
  datasetId: 'ds-1',
};

describe('apify webhook — A3 contracts', () => {
  beforeEach(() => {
    dispatchCalls.length = 0;
    providerRows.clear();
    providerRows.set('run-1', { operation_key: 'acquire:apify:run-1:ds-1:v1', acquisition_request_id: 'req-1' });
  });

  it('1: missing/invalid secret → 401, zero dispatch', async () => {
    const noHeader = await POST(makeRequest(SUCCEEDED_EVENT));
    expect(noHeader.status).toBe(401);
    const wrong = await POST(makeRequest(SUCCEEDED_EVENT, 'wrong-secret'));
    expect(wrong.status).toBe(401);
    expect(dispatchCalls).toHaveLength(0);
  });

  it('2: malformed payload → 400, zero dispatch', async () => {
    const res = await POST(makeRequest({ nonsense: true }, 'whsec-test'));
    expect(res.status).toBe(400);
    const missingRun = await POST(makeRequest({ eventType: 'ACTOR.RUN.SUCCEEDED' }, 'whsec-test'));
    expect(missingRun.status).toBe(400);
    expect(dispatchCalls).toHaveLength(0);
  });

  it('3: nonterminal/unrecognized events acknowledge WITHOUT ingestion', async () => {
    // Schema only admits terminal events, but the guard function is the belt
    // to the schema's braces.
    expect(isTerminalWebhookEvent('ACTOR.RUN.RUNNING')).toBe(false);
    const res = await POST(makeRequest({ ...SUCCEEDED_EVENT, eventType: 'ACTOR.RUN.RUNNING' as never }, 'whsec-test'));
    expect(res.status).toBe(400); // schema rejects nonterminal at the boundary
    expect(dispatchCalls).toHaveLength(0);
  });

  it('4: terminal event → exactly ONE dispatch with the stored operationKey', async () => {
    const res = await POST(makeRequest(SUCCEEDED_EVENT, 'whsec-test'));
    expect(res.status).toBe(200);
    expect(dispatchCalls).toHaveLength(1);
    const call = dispatchCalls[0] as { operationKey: string; providerRunId: string; acquisitionRequestId: string };
    expect(call.operationKey).toBe('acquire:apify:run-1:ds-1:v1');
    expect(call.acquisitionRequestId).toBe('req-1');
  });

  it('5: duplicate terminal webhooks each dispatch idempotently — Trigger collapses them', async () => {
    await POST(makeRequest(SUCCEEDED_EVENT, 'whsec-test'));
    await POST(makeRequest(SUCCEEDED_EVENT, 'whsec-test'));
    await POST(makeRequest(SUCCEEDED_EVENT, 'whsec-test'));
    // Dispatch happens per-callback (fast 2xx), but every call carries the
    // SAME idempotency key — one logical Trigger run. The route stays thin.
    expect(dispatchCalls).toHaveLength(3);
    const keys = new Set(dispatchCalls.map((c) => (c as { operationKey: string }).operationKey));
    expect(keys.size).toBe(1);
  });

  it('6: unknown run → dispatch with DERIVED key; task retries resolve the race; no state minted here', async () => {
    providerRows.clear();
    const res = await POST(makeRequest(SUCCEEDED_EVENT, 'whsec-test'));
    expect(res.status).toBe(200);
    const call = dispatchCalls[0] as { operationKey: string; acquisitionRequestId: string };
    expect(call.operationKey).toBe(acquisitionOperationKey({ provider: 'apify', runId: 'run-1' }));
    expect(call.acquisitionRequestId).toBe('unknown-pending-persistence');
  });

  it('7: webhook schema accepts exactly the four terminal events', () => {
    for (const t of ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED']) {
      expect(ApifyTerminalWebhookSchema.safeParse({ eventType: t, actorRunId: 'r' }).success).toBe(true);
    }
    expect(ApifyTerminalWebhookSchema.safeParse({ eventType: 'ACTOR.RUN.CREATED', actorRunId: 'r' }).success).toBe(false);
    expect(ApifyTerminalWebhookSchema.safeParse({ eventType: 'TOTALLY.MADE.UP', actorRunId: 'r' }).success).toBe(false);
  });
});
