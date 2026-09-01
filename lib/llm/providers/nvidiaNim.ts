import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from "../types";
import { logger } from "@/lib/logger";
import { nvidiaNimConfig } from "@/lib/env";

/**
 * NVIDIA NIM Provider — OpenAI-compatible inference.
 *
 * One shared HTTP/SSE client backs both chat and code roles:
 *   - Chat / deep-thought → deepseek-ai/deepseek-v4-pro-0813
 *   - Code engine        → moonshotai/kimi-k3
 *
 * Model selection is driven by `options.model` (see the model constants below).
 * The endpoint is fixed to https://integrate.api.nvidia.com/v1 (overridable
 * via NVIDIA_NIM_BASE_URL) and authenticated with NVIDIA_API_KEY.
 */
export const NIM_MODEL_DEEPSEEK_V4_PRO = "deepseek-ai/deepseek-v4-pro-0813";
export const NIM_MODEL_KIMI_K3 = "moonshotai/kimi-k3";

export interface NvidiaNimCallOptions extends CompletionOptions {
  /** Emit reasoning_content / thinking trace into the stream (default: false). */
  includeReasoning?: boolean;
  /** Kimi K3 reasoning effort passthrough ("low" | "medium" | "high" | "max"). */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
  /** Per-request timeout override (ms). Falls back to NIM_REQUEST_TIMEOUT_MS env or 120s. */
  timeoutMs?: number;
}

export class NvidiaNimProvider implements LLMProvider {
  id = "nvidia-nim";
  name = "NVIDIA NIM";

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    const cfg = nvidiaNimConfig();
    this.apiKey = apiKey ?? cfg?.apiKey ?? "";
    this.baseUrl = baseUrl ?? cfg?.baseUrl ?? "https://integrate.api.nvidia.com/v1";
    if (!this.apiKey) {
      logger.warn("[NvidiaNimProvider] NVIDIA_API_KEY is not set — requests will fail at call time.");
    }
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error("[NvidiaNimProvider] NVIDIA_API_KEY is not set. Set it in your environment before starting.");
    }
  }

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: NvidiaNimCallOptions = {}
  ): Promise<StreamResult> {
    this.assertConfigured();

    const modelId = options.model || NIM_MODEL_DEEPSEEK_V4_PRO;

    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg.text,
    }));

    if (systemInstruction) {
      formattedMessages.unshift({ role: 'system', content: systemInstruction });
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: formattedMessages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.95,
      stream: true,
    };

    // DeepSeek V4 / Kimi K3 accept a chat_template_kwargs block.
    body.chat_template_kwargs = { thinking: options.includeReasoning === true };
    if (options.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? Number(process.env.NIM_REQUEST_TIMEOUT_MS ?? '120_000');
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      const elapsed = Date.now() - started;
      const isTimeout = err?.name === 'AbortError' || String(err?.message || err).includes('aborted');
      logger.error(`[NvidiaNimProvider] request failed after ${elapsed}ms`, {
        model: modelId,
        elapsed,
        isTimeout,
        error: err?.message || String(err),
      });
      throw new Error(
        `NVIDIA NIM request failed${isTimeout ? `: This operation was aborted (timeout=${timeoutMs}ms, elapsed=${elapsed}ms)` : `: ${err?.message ?? String(err)}`}`
      );
    }

    const upstreamLatencyMs = Date.now() - started;
    logger.info(`[NvidiaNimProvider] upstream response ${response.status}`, {
      model: modelId,
      upstreamLatencyMs,
      status: response.status,
    });

    if (!response.ok) {
      clearTimeout(timer);
      const errText = await response.text().catch(() => '');
      const trimmed = errText.slice(0, 500);
      const isDegraded = response.status === 400 && trimmed.includes('DEGRADED');
      logger.error(`[NvidiaNimProvider] HTTP ${response.status}${isDegraded ? ' (DEGRADED)' : ''}: ${trimmed}`, {
        model: modelId,
        upstreamLatencyMs,
        isDegraded,
      });
      throw new Error(`NVIDIA NIM error (${response.status})${isDegraded ? ' [DEGRADED]' : ''}: ${trimmed}`);
    }

    if (!response.body) {
      clearTimeout(timer);
      throw new Error('[NvidiaNimProvider] Empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let firstChunk = true;

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
              const delta = json.choices?.[0]?.delta ?? {};

              // Track time-to-first-token for the streaming path.
              if (firstChunk && (delta.content || delta.reasoning_content || delta.thinking)) {
                firstChunk = false;
                const ttft = Date.now() - started;
                logger.info(`[NvidiaNimProvider] TTFT ${ttft}ms`, {
                  model: modelId,
                  ttft,
                  upstreamLatencyMs,
                });
              }

              // Reasoning / thinking trace — wrap so downstream streaming
              // treats it consistently with Gemini/Hermes signaling.
              if (delta.reasoning_content) {
                streamController.enqueue(encoder.encode(`<thinking>${delta.reasoning_content}</thinking>`));
              }
              if (delta.thinking) {
                streamController.enqueue(encoder.encode(`<thinking>${delta.thinking}</thinking>`));
              }
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