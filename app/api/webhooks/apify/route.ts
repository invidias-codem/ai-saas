// app/api/webhooks/apify/route.ts
// A3: Apify terminal webhook. Does ALMOST NOTHING:
//   authenticate → validate → find persisted run → dispatch Trigger → 2xx.
// No dataset reads, no normalization, no bulk writes, no AI calls.
//
// Duplicate callbacks are harmless: Trigger idempotencyKey (operationKey)
// collapses them into one logical task run, and the DB claim is the
// authoritative backstop. Unknown runs dispatch the task anyway — Trigger
// retries resolve the webhook-beats-persistence race; the task NEVER mints
// provider state from webhook contents.

import { NextResponse } from 'next/server';
import { ApifyTerminalWebhookSchema, isTerminalWebhookEvent } from '@/lib/acquisition/durable/webhookSchema';
import { getProviderRun } from '@/lib/acquisition/store/acquisitionStore';
import { acquisitionOperationKey } from '@/lib/acquisition/contracts';
import { dispatchAcquisitionIngest } from '@/lib/trigger/dispatch';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  // 1. Authenticate — dedicated secret in a custom header. Missing secret
  //    config ⇒ reject everything (fail closed).
  const secret = env.APIFY_WEBHOOK_SECRET;
  const provided = req.headers.get('x-lattice-apify-secret');
  if (!secret || provided !== secret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Validate schema.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  const parsed = ApifyTerminalWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return new NextResponse('Invalid payload', { status: 400 });
  }
  const webhook = parsed.data;

  // 3. Nonterminal/unknown events: acknowledge, ingest nothing.
  if (!isTerminalWebhookEvent(webhook.eventType)) {
    return NextResponse.json({ acknowledged: true, ingested: false });
  }

  // 4. Look up the persisted provider run. Unknown run ≠ invalid run: the
  //    webhook may have beaten persistence. Dispatch anyway — the task
  //    re-reads durable state and retries; it will never mint a row.
  let operationKey: string;
  const run = await getProviderRun('apify', webhook.actorRunId);
  if (run?.operation_key) {
    operationKey = run.operation_key;
  } else {
    // Correlation-only derivation: acquisitionOperationKey(provider, runId).
    // The task verifies this against the persisted row before claiming.
    operationKey = acquisitionOperationKey({ provider: 'apify', runId: webhook.actorRunId });
  }

  // 5. Idempotent Trigger dispatch — duplicates resolve to ONE logical run.
  const dispatch = await dispatchAcquisitionIngest({
    acquisitionRequestId: run?.acquisition_request_id ?? 'unknown-pending-persistence',
    provider: 'apify',
    providerRunId: webhook.actorRunId,
    operationKey,
  });

  return NextResponse.json({ acknowledged: true, ingested: true, dispatch: dispatch?.triggerRunId ?? null });
}
