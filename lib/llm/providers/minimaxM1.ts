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

    const controller = new AbortController();
    // NIM aligns to ≤50s; OpenRouter MiniMax-M1 can run long — cap below function budget.
    const timeoutMs = Number(process.env.NIM_REQUEST_TIMEOUT_MS ?? 50_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === 'AbortError' || String(err?.message || err).includes('aborted');
      logger.error('[MiniMaxM1Provider] request failed', { model: modelId, isTimeout, error: err?.message || String(err) });
      throw new Error(`MiniMax-M1 request failed${isTimeout ? ' (timeout)' : ''}: ${err?.message ?? String(err)}`);
    }

    const upstreamLatencyMs = Date.now() - started;

    if (!response.ok) {
      clearTimeout(timer);
      const errText = await response.text().catch(() => '');
      const trimmed = errText.slice(0, 500);
      logger.error(`[MiniMaxM1Provider] HTTP ${response.status}: ${trimmed}`, { model: modelId, upstreamLatencyMs });
      // Preserve status so the router can classify 429/5xx vs 4xx.
      const e = new Error(`MiniMax-M1 error (${response.status}): ${trimmed}`) as Error & { status?: number };
      e.status = response.status;
      throw e;
    }

    if (!response.body) {
      clearTimeout(timer);
      throw new Error('[MiniMaxM1Provider] Empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    const stream = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
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
              clearTimeout(timer);
              streamController.close();
              return;
            }

            try {
              const json = JSON.parse(payload);
              // OpenRouter can return 200 with an error payload on upstream failure.
              if (json.error) {
                clearTimeout(timer);
                streamController.error(new Error(`MiniMax-M1 upstream error: ${json.error?.message || JSON.stringify(json.error)}`));
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
          clearTimeout(timer);
          streamController.error(err);
        }
      },
      cancel() {
        clearTimeout(timer);
        reader.cancel().catch(() => {});
      },
    });

    return {
      stream,
      debug: { model: modelId, provider: this.id, upstreamLatencyMs },
    };
  }
}