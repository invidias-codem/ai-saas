// lib/llm/providers/minimaxM1.ts
// MiniMax-M1 1M-token context fallback provider, served through OpenRouter.
//
// MiniMax-M1 is text-only with a ~1M-token context window — the "zero-loss"
// fallback tier that can absorb a full conversation when lower-context primary
// models rate-limit or degrade. Routed via OpenRouter (self-hosted AIML is not
// configured in this repo; OPENROUTER_API_KEY is a first-class provider).
//
// Streaming contract matches LLMProvider.generateStream(): returns a
// ReadableStream<Uint8Array> (OpenAI-compatible SSE parsed into plain text), so
// it pipes cleanly through conversationEngine's TransformStream.

import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from '../types';
import { logger } from '@/lib/logger';
import { encodeProviderErrorEvent } from '@/lib/media/envelope';

const MINIMAX_M1_MODEL = 'minimax/minimax-m1';

// 1M-token context: generous max_tokens (OpenRouter caps per-model; fall back gracefully).
const DEFAULT_MAX_TOKENS = 64_000;

function apiKey(): string {
  return process.env.OPENROUTER_API_KEY || '';
}

export class MiniMaxM1Provider implements LLMProvider {
  id = 'minimax-m1';
  name = 'MiniMax-M1 (1M context)';

  private assertConfigured(): void {
    if (!apiKey()) {
      throw new Error(
        '[MiniMaxM1Provider] OPENROUTER_API_KEY is not set. MiniMax-M1 fallback is unavailable.'
      );
    }
  }

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions = {}
  ): Promise<StreamResult> {
    this.assertConfigured();

    const modelId = options.model || MINIMAX_M1_MODEL;

    // Canonical wire format: text-only roles. 'model'/'bot' collapse to 'assistant'.
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'model' || msg.role === 'bot' ? 'assistant' : msg.role,
      content: msg.text,
    }));

    if (systemInstruction) {
      formattedMessages.unshift({ role: 'system', content: systemInstruction });
    }

    // Split lifecycle: connect timeout only during header wait; the budget
    // signal persists through streaming so a stuck stream dies at the total
    // budget. Mid-stream death closes cleanly (marker + close), never
    // error() — that faults the client HTTP response (Vercel 500s).
    const CONNECT_TIMEOUT_MS = Number(process.env.NIM_CONNECT_TIMEOUT_MS ?? 30_000);
    const TOTAL_BUDGET_MS = Number(process.env.NIM_TOTAL_STREAM_BUDGET_MS ?? 240_000);
    const connectSignal = AbortSignal.timeout(CONNECT_TIMEOUT_MS);
    const budgetSignal = AbortSignal.timeout(TOTAL_BUDGET_MS);
    const started = Date.now();

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: formattedMessages,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: options.temperature ?? 0.7,
          top_p: options.topP ?? 0.95,
          stream: true,
        }),
        signal: AbortSignal.any([connectSignal, budgetSignal]),
      });
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError' || String(err?.message || err).includes('aborted');
      logger.error('[MiniMaxM1Provider] request failed', { model: modelId, isTimeout, error: err?.message || String(err) });
      throw new Error(`MiniMax-M1 request failed${isTimeout ? ' (timeout)' : ''}: ${err?.message ?? String(err)}`);
    }

    const upstreamLatencyMs = Date.now() - started;

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const trimmed = errText.slice(0, 500);
      logger.error(`[MiniMaxM1Provider] HTTP ${response.status}: ${trimmed}`, { model: modelId, upstreamLatencyMs });
      // Preserve status so the router can classify 429/5xx vs 4xx.
      const e = new Error(`MiniMax-M1 error (${response.status}): ${trimmed}`) as Error & { status?: number };
      e.status = response.status;
      throw e;
    }

    if (!response.body) {
      throw new Error('[MiniMaxM1Provider] Empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    // Mid-stream death: marker + clean close, never error() (Vercel 500s).
    const failCleanly = (streamController: ReadableStreamDefaultController, reason: string) => {
      logger.error(`[MiniMaxM1Provider] stream ended early: ${reason}`);
      try {
        streamController.enqueue(encoder.encode(encodeProviderErrorEvent({ provider: this.id, model: modelId, reason })));
      } catch { /* client gone */ }
      try { streamController.close(); } catch { /* already closed */ }
    };

    const stream = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            streamController.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line || !line.startsWith('data:')) continue;

            const payload = line.slice(5).trim();
            if (payload === '[DONE]') {
              streamController.close();
              return;
            }

            try {
              const json = JSON.parse(payload);
              // OpenRouter can return 200 with an error payload on upstream failure.
              if (json.error) {
                failCleanly(streamController, `upstream_error: ${json.error?.message || JSON.stringify(json.error)}`);
                return;
              }
              const delta = json.choices?.[0]?.delta ?? {};
              if (delta.content) {
                streamController.enqueue(encoder.encode(delta.content));
              }
            } catch {
              // Ignore partial / malformed chunks — SSE may split across reads.
            }
          }
        } catch (err: any) {
          // Mid-stream provider death must NEVER error() the client stream —
          // that faults the HTTP response. Marker + clean close.
          failCleanly(streamController, String(err?.message || err));
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    return {
      stream,
      debug: { model: modelId, provider: this.id, upstreamLatencyMs },
    };
  }
}