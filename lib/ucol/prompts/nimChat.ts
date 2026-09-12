// lib/ucol/prompts/nimChat.ts
// Shared non-streaming OpenAI-compatible completion helper for the UCOL
// Code Builder debate loop (planner / coder / reviewer). All three stages
// call Kimi K3 directly against NVIDIA NIM — no self-proxy hop, no relative
// URL resolution (which threw ERR_INVALID_URL under Node's fetch()).
import { nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

const NIM_MODEL_KIMI_K3 = 'moonshotai/kimi-k3';
const DEFAULT_TIMEOUT_MS = 50_000;

export interface NimChatResult {
  text: string;
  model: string;
  upstreamLatencyMs?: number;
}

export interface NimChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  /** Per-call timeout (ms). Falls back to NIM_REQUEST_TIMEOUT_MS, then 50s. */
  timeoutMs?: number;
}

/**
 * Non-streaming completion straight to NVIDIA NIM /chat/completions.
 *
 * The abort timer stays armed through body consumption (not just headers), so
 * a stalled response body can't hold the Code Builder stream open past the
 * timeout budget.
 */
export async function nimChat(
  systemPrompt: string,
  userPrompt: string,
  opts: NimChatOptions = {}
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

  // Collapse malformed values to the default: a zero, negative, or NaN timeout
  // would otherwise schedule an immediate abort and kill every build.
  const rawTimeout = Number(opts.timeoutMs ?? process.env.NIM_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let text = '';
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const errText = response.ok ? '' : await response.text().catch(() => '');

    if (!response.ok) {
      logger.error('[nimChat] NIM error', {
        model: modelId,
        status: response.status,
        totalLatencyMs: Date.now() - started,
        error: errText.slice(0, 500),
      });
      throw new Error(`[NIM] error ${response.status}: ${errText.slice(0,500)} (total=${Date.now() - started}ms)`);
    }

    // Do NOT swallow aborts here: if the body read is aborted (timeout fired
    // mid-consumption), `.catch(() => null)` would mask it as an empty success.
    const json = await response.json();
    text = json?.choices?.[0]?.message?.content ?? '';
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    const isTimeout = err?.name === 'AbortError' || String(err?.message || err).includes('aborted');
    if (isTimeout) {
      logger.error('[nimChat] request timed out', {
        model: modelId,
        totalLatencyMs: latencyMs,
        timeoutMs,
      });
      throw new Error(`[NIM] request timed out (timeout=${timeoutMs}ms, total=${latencyMs}ms)`);
    }
    // Non-timeout failures (network, HTTP error already logged+rethrown above).
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  logger.info('[nimChat] completed', {
    model: modelId,
    totalLatencyMs: latencyMs,
  });

  return { text, model: modelId, upstreamLatencyMs: latencyMs };
}

export { NIM_MODEL_KIMI_K3 };