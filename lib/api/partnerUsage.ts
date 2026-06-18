/**
 * Partner usage metering. Records each gateway call for billing + analytics.
 *
 * Writes are fire-and-forget (never block the partner's request). Failures are
 * logged but swallowed — metering must never break the API.
 */

import { supabaseAdmin } from '@/lib/supabaseClient';

export interface UsageRecord {
  keyId: string;
  workspaceId: string;
  endpoint: string;
  method?: string;
  statusCode: number;
  tokensIn?: number;
  tokensOut?: number;
  modelUsed?: string;
  latencyMs?: number;
}

/**
 * Record a usage event. Fire-and-forget — call without awaiting in hot paths,
 * or await if you need write confirmation (e.g. in tests).
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  if (!supabaseAdmin) return;

  try {
    await supabaseAdmin.from('partner_usage').insert({
      key_id: record.keyId,
      workspace_id: record.workspaceId,
      endpoint: record.endpoint,
      method: record.method ?? 'POST',
      status_code: record.statusCode,
      tokens_in: record.tokensIn ?? 0,
      tokens_out: record.tokensOut ?? 0,
      model_used: record.modelUsed ?? null,
      latency_ms: record.latencyMs ?? 0,
    });
  } catch (err) {
    console.error('[partner_usage] failed to record usage:', err);
  }
}

/**
 * Convenience wrapper that times a handler and records usage automatically.
 * Returns the handler's result; metering runs as a side-effect.
 */
export async function withMetering<T>(
  params: {
    keyId: string;
    workspaceId: string;
    endpoint: string;
    method?: string;
  },
  handler: () => Promise<{ result: T; statusCode: number; tokensIn?: number; tokensOut?: number; modelUsed?: string }>
): Promise<T> {
  const start = Date.now();
  let statusCode = 500;
  let tokensIn = 0;
  let tokensOut = 0;
  let modelUsed: string | undefined;

  try {
    const out = await handler();
    statusCode = out.statusCode;
    tokensIn = out.tokensIn ?? 0;
    tokensOut = out.tokensOut ?? 0;
    modelUsed = out.modelUsed;
    return out.result;
  } finally {
    void recordUsage({
      keyId: params.keyId,
      workspaceId: params.workspaceId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode,
      tokensIn,
      tokensOut,
      modelUsed,
      latencyMs: Date.now() - start,
    });
  }
}
