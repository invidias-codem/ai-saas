import { ChatMessage, CompletionOptions, LLMProvider, StreamResult } from "../types";
import { foldToolCallDeltas, type NimToolCall } from "../toolCallTypes";
import { logger } from "@/lib/logger";
import { nvidiaNimConfig } from "@/lib/env";
import { withAbort } from "@/lib/runtime/abort";
import { encodeProviderErrorEvent } from "@/lib/media/envelope";

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
export const NIM_MODEL_DEEPSEEK_V4_PRO = "nvidia/nemotron-3-ultra-550b-a55b";
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

  /**
   * Non-streaming tool-calling completion (OpenAI-compatible).
   *
   * Used by the agentic ReAct loop, which walks a DAG of tool calls and needs
   * the complete tool_calls set up-front (streaming accumulation can't satisfy
   * this cleanly). Hits /chat/completions with stream:false, tools, tool_choice.
   */
  async chatWithTools(
    messages: Array<Record<string, unknown>>,
    params: {
      systemInstruction?: string;
      model?: string;
      tools?: import('../toolCallTypes').NimToolSpec[];
      tool_choice?: import('../toolCallTypes').NimToolChoice;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<{ content: string; toolCalls: NimToolCall[]; model: string }> {
    this.assertConfigured();
    const modelId = params.model || NIM_MODEL_KIMI_K3;

    // Pass messages through as-is (they already follow the OpenAI shape:
    // role/content/tool_calls/tool_call_id). Normalize a `text` field if present.
    const formattedMessages = messages.map((msg) => {
      if (msg.role === 'model') msg.role = 'assistant';
      if (typeof msg.text === 'string' && msg.content === undefined) {
        msg.content = msg.text;
        delete msg.text;
      }
      return msg;
    });
    if (params.systemInstruction) {
      formattedMessages.unshift({ role: 'system', content: params.systemInstruction });
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: formattedMessages,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      top_p: 0.95,
      stream: false,
      ...(params.tools?.length ? { tools: params.tools, tool_choice: params.tool_choice ?? "auto" } : {}),
    };

    const controller = new AbortController();
    const timeoutMs = Number(process.env.NIM_REQUEST_TIMEOUT_MS ?? 50_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      throw new Error(`NVIDIA NIM tool-call request failed: ${err?.message ?? String(err)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const trimmed = errText.slice(0, 500);
      const isDegraded = response.status === 400 && trimmed.includes('DEGRADED');
      throw new Error(`NVIDIA NIM tool-call error (${response.status})${isDegraded ? ' [DEGRADED]' : ''}: ${trimmed}`);
    }

    const json = await response.json().catch(() => null);
    const message = json?.choices?.[0]?.message ?? {};
    const content: string = message.content ?? '';
    const toolCalls: NimToolCall[] = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((tc: any) => ({
          id: tc.id ?? '',
          type: 'function',
          function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
        }))
      : [];

    return { content, toolCalls, model: modelId };
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

    // Tool-calling (OpenAI-compatible): pass tools + tool_choice when requested.
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.tool_choice ?? "auto";
    }

    // Nemotron uses enable_thinking in chat_template_kwargs.
    body.chat_template_kwargs = { enable_thinking: options.includeReasoning === true };
    if (options.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    // ── Stream lifecycle: split timeouts, never error() the client stream ──
    // A single wall-clock abort timer killed healthy streams mid-flight, and
    // streamController.error() faulted the HTTP response itself (Vercel
    // FUNCTION_INVOCATION_FAILED 500s). Split into: connection timeout
    // (cleared once headers arrive), idle-between-chunks timeout (reset on
    // every chunk), total stream budget (default 240s, fits Fluid's 300s).
    // Mid-stream death: log + structured __PROVIDER_ERROR_EVENT__ marker +
    // clean close. Pre-first-token death still throws so the fallback router
    // can hop.
    const CONNECT_TIMEOUT_MS = Number(process.env.NIM_CONNECT_TIMEOUT_MS ?? 30_000);
    const IDLE_TIMEOUT_MS = Number(process.env.NIM_IDLE_TIMEOUT_MS ?? 60_000);
    const TOTAL_BUDGET_MS = Number(process.env.NIM_TOTAL_STREAM_BUDGET_MS ?? 240_000);
    const perRequestTimeoutMs = options.timeoutMs; // legacy per-request override caps the TOTAL budget
    const totalBudgetMs = perRequestTimeoutMs ?? TOTAL_BUDGET_MS;

    let response: Response;
    const started = Date.now();
    // Connect timeout: a cancelable controller whose timer is cleared the
    // moment headers arrive — the signal must NOT stay attached to the body
    // (a 30s signal would kill healthy long streams).
    const connectController = new AbortController();
    const budgetController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(new Error('connect_timeout')), CONNECT_TIMEOUT_MS);
    const budgetTimer = setTimeout(() => budgetController.abort(new Error('total_budget')), totalBudgetMs);
    const streamSignal = AbortSignal.any([connectController.signal, budgetController.signal, ...(options.signal ? [options.signal] : [])]);
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: streamSignal,
      });
      clearTimeout(connectTimer); // headers arrived — body runs on budget only
    } catch (err: any) {
      clearTimeout(connectTimer);
      clearTimeout(budgetTimer);
      const elapsed = Date.now() - started;
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError' || String(err?.message || err).includes('aborted');
      logger.error(`[NvidiaNimProvider] request failed after ${elapsed}ms`, {
        model: modelId,
        elapsed,
        isTimeout,
        error: err?.message || String(err),
      });
      throw new Error(
        `NVIDIA NIM request failed${isTimeout ? `: This operation was aborted (connect=${CONNECT_TIMEOUT_MS}ms, total=${totalBudgetMs}ms, elapsed=${elapsed}ms)` : `: ${err?.message ?? String(err)}`}`
      );
    }

    const upstreamLatencyMs = Date.now() - started;
    logger.info(`[NvidiaNimProvider] upstream response ${response.status}`, {
      model: modelId,
      upstreamLatencyMs,
      status: response.status,
    });

    if (!response.ok) {
      let errText = '';
      try {
        errText = await withAbort(response.text(), streamSignal);
      } finally {
        clearTimeout(budgetTimer);
        budgetController.abort(new Error('http_error'));
      }
      const trimmed = errText.slice(0, 500);
      const isDegraded = response.status === 400 && trimmed.includes('DEGRADED');
      const error = new Error(`NVIDIA NIM error (${response.status})${isDegraded ? ' [DEGRADED]' : ''}: ${trimmed}`);
      Object.assign(error, { status: response.status });
      throw error;
    }

    if (!response.body) {
      clearTimeout(budgetTimer);
      budgetController.abort(new Error('empty_body'));
      throw new Error('[NvidiaNimProvider] Empty response body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    let firstChunk = true;
    let terminal = false;
    const toolCalls: NimToolCall[] = [];
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const clearIdle = () => clearTimeout(idleTimer);
    const finish = (reason?: unknown) => {
      if (terminal) return;
      terminal = true;
      clearIdle();
      clearTimeout(budgetTimer);
      logger.info('[NvidiaNimProvider] stream finished', {
        model: modelId, elapsedMs: Date.now() - started, producedOutput: !firstChunk,
        reason: reason instanceof Error ? reason.message : reason === undefined ? 'complete' : String(reason),
      });
      budgetController.abort(reason ?? new Error('stream_complete'));
      // Never await cancellation: a broken upstream must not block fallback.
      void reader.cancel(reason).catch(() => {}).finally(() => reader.releaseLock());
    };
    const parseLine = (line: string, controller: ReadableStreamDefaultController<Uint8Array>): number => {
      line = line.trim();
      if (!line.startsWith('data:')) return 0;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        finish();
        controller.close();
        return 0;
      }
      let json;
      try { json = JSON.parse(payload); } catch { return 0; }
      if (json.error) throw new Error(`NIM stream error: ${JSON.stringify(json.error).slice(0, 300)}`);
      const delta = json.choices?.[0]?.delta ?? {};
      if (firstChunk && (delta.content || delta.reasoning_content || delta.thinking)) {
        firstChunk = false;
        logger.info(`[NvidiaNimProvider] TTFT ${Date.now() - started}ms`, {
          model: modelId, ttft: Date.now() - started, upstreamLatencyMs,
        });
      }
      let emitted = 0;
      for (const text of [
        delta.reasoning_content ? `<thinking>${delta.reasoning_content}</thinking>` : '',
        delta.thinking ? `<thinking>${delta.thinking}</thinking>` : '',
        delta.content,
      ]) {
        if (text) { controller.enqueue(encoder.encode(text)); emitted++; }
      }
      if (delta.tool_calls) {
        const folded = foldToolCallDeltas(toolCalls, delta.tool_calls);
        toolCalls.splice(0, toolCalls.length, ...folded);
      }
      return emitted;
    };
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Metadata, heartbeats and split frames produce no downstream bytes.
        // Keep reading within this pull until output or a terminal condition.
        try {
          let emitted = 0;
          while (!terminal && emitted === 0) {
            idleTimer = setTimeout(() => budgetController.abort(new Error('idle_timeout')), IDLE_TIMEOUT_MS);
            const { done, value } = await withAbort(reader.read(), streamSignal);
            clearIdle();
            if (terminal) return;
            buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
            let idx: number;
            while (!terminal && (idx = buffer.indexOf('\n')) >= 0) {
              const line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              emitted += parseLine(line, controller);
            }
            if (done && !terminal) {
              if (buffer.trim()) parseLine(buffer, controller);
              if (!terminal) { finish(); controller.close(); }
            }
          }
        } catch (err: unknown) {
          if (terminal) return;
          finish(err);
          const reason = err instanceof Error ? err.message : String(err);
          logger.error(`[NvidiaNimProvider] stream ended early: ${reason}`);
          controller.enqueue(encoder.encode(encodeProviderErrorEvent({ provider: 'nvidia-nim', model: modelId, reason })));
          controller.close();
        }
      },
      cancel(reason) { finish(reason); },
    });

    return {
      stream,
      debug: { model: modelId, provider: this.id, upstreamLatencyMs },
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }
}
