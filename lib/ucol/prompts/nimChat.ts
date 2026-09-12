// lib/ucol/prompts/nimChat.ts
// Shared non-streaming OpenAI-compatible completion helper for the UCOL
// Code Builder debate loop (planner / coder / reviewer). All three stages
// call Kimi K3 directly against NVIDIA NIM — no self-proxy hop, no relative
// URL resolution (which threw ERR_INVALID_URL under Node's fetch()).
import { nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

const NIM_MODEL_KIMI_K3 = 'moonshotai/kimi-k3';

export interface NimChatResult {
  text: string;
  model: string;
  upstreamLatencyMs?: number;
}

/**
 * Non-streaming completion straight to NVIDIA NIM /chat/completions.
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

  const controller = new AbortController();
  const timeoutMs = Number(process.env.NIM_REQUEST_TIMEOUT_MS ?? 50_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const isTimeout = err?.name === 'AbortError' || String(err?.message || err).includes('aborted');
    logger.error('[nimChat] request failed', {
      model: modelId,
      totalLatencyMs: latencyMs,
      isTimeout,
      error: err?.message || String(err),
    });
    throw new Error(
      `[NIM] request failed${isTimeout ? ` (timeout=${timeoutMs}ms, total=${latencyMs}ms)` : `: ${err?.message ?? String(err)}`}`
    );
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.error('[nimChat] NIM error', {
      model: modelId,
      status: response.status,
      totalLatencyMs: latencyMs,
      error: errText.slice(0, 500),
    });
    throw new Error(`[NIM] error ${response.status}: ${errText.slice(0,500)} (total=${latencyMs}ms)`);
  }

  const json = await response.json().catch(() => null);
  const text = json?.choices?.[0]?.message?.content ?? '';

  logger.info('[nimChat] completed', {
    model: modelId,
    totalLatencyMs: latencyMs,
  });

  return { text, model: modelId, upstreamLatencyMs: latencyMs };
}

export { NIM_MODEL_KIMI_K3 };