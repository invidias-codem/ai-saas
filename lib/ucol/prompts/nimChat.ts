// lib/ucol/prompts/nimChat.ts
// Shared non-streaming OpenAI-compatible completion helper for the UCOL
// Code Builder debate loop (planner / coder / reviewer). All three stages
// call Kimi K3 directly against NVIDIA NIM — no self-proxy hop, no relative
// URL resolution (which threw ERR_INVALID_URL under Node's fetch()).
import { nvidiaNimConfig } from '@/lib/env';
import { logger } from '@/lib/logger';

const NIM_MODEL_KIMI_K3 = 'moonshotai/kimi-k3';
const DEFAULT_TIMEOUT_MS = 50_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 15_000;

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
 * Structured provider error carrying the raw HTTP status and any Retry-After
 * hint, so callers can distinguish throttling from application/code failures.
 */
export class NimProviderError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | undefined;
  readonly isThrottled: boolean;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'NimProviderError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.isThrottled = status === 429 || status === 503;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  // HTTP-date form, e.g. "Wed, 21 Oct 2015 07:28:00 GMT"
  const dateVal = Date.parse(value);
  if (!Number.isNaN(dateVal)) {
    return Math.max(0, dateVal - Date.now());
  }
  // Delta-seconds form, e.g. "120"
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) {
    return secs * 1000;
  }
  return undefined;
}

/**
 * Non-streaming completion straight to NVIDIA NIM /chat/completions.
 *
 * Retries 429/503 with bounded exponential backoff + jitter, honoring
 * Retry-After and the remaining per-call timeout budget. The abort timer stays
 * armed through body consumption so a stalled body can't outlive the budget.
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

  // Collapse malformed values to the default: a zero, negative, or NaN timeout
  // would otherwise schedule an immediate abort and kill every build.
  const rawTimeout = Number(opts.timeoutMs ?? process.env.NIM_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;

  const started = Date.now();
  const deadline = started + timeoutMs;
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;

  let lastStatus = 0;
  let lastRetryAfterMs: number | undefined;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const remainingMs = deadline - Date.now();
    // Give up the retry loop if we've exhausted the overall budget.
    const timer = setTimeout(() => controller.abort(), Math.max(remainingMs, 0));

    let response: Response;
    try {
      response = await fetch(url, {
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
      const isTimeout = err?.name === 'AbortError' || String(err?.message || err).includes('aborted');
      if (isTimeout) {
        throw new Error(`[NIM] request timed out (timeout=${timeoutMs}ms, total=${Date.now() - started}ms)`);
      }
      // Network / connection error — non-throttling, retry once more cheaply if budget allows.
      if (attempt < MAX_RETRIES && Date.now() < deadline) {
        lastStatus = 0;
        await sleep(jitter(RETRY_BASE_DELAY_MS));
        continue;
      }
      throw err;
    }

    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

    if (response.status === 429 || response.status === 503) {
      clearTimeout(timer);
      lastStatus = response.status;
      lastRetryAfterMs = retryAfterMs;
      // Drain the body so the connection is reusable.
      await response.text().catch(() => {});

      if (attempt < MAX_RETRIES && Date.now() < deadline) {
        const delay = retryAfterMs ?? jitter(Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS));
        logger.warn('[nimChat] throttled, retrying', {
          model: modelId,
          status: response.status,
          attempt: attempt + 1,
          delayMs: Math.round(delay),
          retryAfterMs,
        });
        await sleep(Math.min(delay, Math.max(deadline - Date.now(), 0)));
        continue;
      }

      logger.error('[nimChat] throttle exhausted', {
        model: modelId,
        status: response.status,
        attempts: attempt + 1,
        totalLatencyMs: Date.now() - started,
      });
      throw new NimProviderError(
        `[NIM] provider throttled (${response.status}) after ${attempt + 1} attempt(s) (total=${Date.now() - started}ms)`,
        response.status,
        retryAfterMs
      );
    }

    const errText = response.ok ? '' : await response.text();

    if (!response.ok) {
      clearTimeout(timer);
      logger.error('[nimChat] NIM error', {
        model: modelId,
        status: response.status,
        totalLatencyMs: Date.now() - started,
        error: errText.slice(0, 500),
      });
      throw new NimProviderError(
        `[NIM] error ${response.status}: ${errText.slice(0, 500)} (total=${Date.now() - started}ms)`,
        response.status
      );
    }

    // Do NOT swallow aborts here: if the body read is aborted (timeout fired
    // mid-consumption), `.catch(() => null)` would mask it as an empty success.
    clearTimeout(timer);
    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? '';

    logger.info('[nimChat] completed', {
      model: modelId,
      totalLatencyMs: Date.now() - started,
      attempts: attempt + 1,
    });

    return { text, model: modelId, upstreamLatencyMs: Date.now() - started };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  // Full-ish jitter: random value in [ms/2, ms*1.5]. Keeps retry storms from
  // self-synchronizing across concurrent callers.
  return ms / 2 + Math.random() * ms;
}

export { NIM_MODEL_KIMI_K3 };