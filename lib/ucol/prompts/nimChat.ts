// lib/ucol/prompts/nimChat.ts
// Shared non-streaming OpenAI-compatible completion helper for the UCOL
// Code Builder debate loop (planner / coder / reviewer). All three stages
// call Kimi K3 through the internal Vercel proxy to reuse warm connection
// pools and get first-class latency telemetry.
import { nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

const NIM_MODEL_KIMI_K3 = 'moonshotai/kimi-k3';
const INTERNAL_NIM_PROXY = '/api/internal/nim-chat';

export interface NimChatResult {
  text: string;
  model: string;
  upstreamLatencyMs?: number;
}

/**
 * Non-streaming completion through the internal Vercel NIM proxy.
 * The proxy reuses warm egress/TLS pools and returns upstream latency
 * in the `x-nim-upstream-latency-ms` response header.
 */
export async function nimChat(
  systemPrompt: string,
  userPrompt: string,
  opts: { model?: string; temperature?: number; maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' | 'max' } = {}
): Promise<NimChatResult> {
  const cfg = nvidiaNimConfig();
  if (!cfg) {
    throw new Error('[NIM] NVIDIA_API_KEY is not set. Code Builder requires NVIDIA NIM.');
  }

  const modelId = opts.model || NIM_MODEL_KIMI_K3;
  const body = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: modelId,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 8192,
    top_p: 0.95,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
    ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
  };

  const started = Date.now();
  const response = await fetch(INTERNAL_NIM_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const latencyMs = Date.now() - started;
  const upstreamLatencyMs = Number(response.headers.get('x-nim-upstream-latency-ms') || '0');

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.error('[nimChat] proxy error', {
      model: modelId,
      status: response.status,
      totalLatencyMs: latencyMs,
      upstreamLatencyMs,
      error: errText.slice(0, 500),
    });
    throw new Error(`[NIM] proxy error ${response.status}: ${errText.slice(0, 500)} (total=${latencyMs}ms, upstream=${upstreamLatencyMs}ms)`);
  }

  const json = await response.json().catch(() => null);
  const text = json?.choices?.[0]?.message?.content ?? '';

  logger.info('[nimChat] completed', {
    model: modelId,
    totalLatencyMs: latencyMs,
    upstreamLatencyMs,
  });

  return { text, model: modelId, upstreamLatencyMs };
}

export { NIM_MODEL_KIMI_K3 };
