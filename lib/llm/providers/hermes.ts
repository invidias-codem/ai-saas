import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

/**
 * Fast Provider — Self-hosted vLLM (Vast.ai) + Nous Research Inference API
 *
 * Routing priority (UCOL T-027):
 *   1. Vast.ai vLLM (self-hosted Qwen2.5-32B-Instruct, 4x RTX 2080 Ti) — primary, zero API cost
 *   2. Nous AI Cloud                            — fallback when Vast.ai unavailable
 *   3. Local Ollama (development only)         — local dev fallback
 *   4. Gemini Flash-Lite                        — always-available last resort
 */

const NOUS_API_KEY = process.env.NOUSE_API_KEY;

// ── Security: base URL is hardcoded — never env-overridable (CVE-2025-59536) ──
const NOUS_BASE_URL = "https://inference-api.nousresearch.com/v1";

// Separate cloud fallback model id from local/self-hosted naming.
const NOUS_MODEL = process.env.NOUS_MODEL_ID || "Hermes-4-70B";

// Vast.ai vLLM (primary)
const LAMBDA_OLLAMA_URL = process.env.LAMBDA_OLLAMA_URL || "";
const ENABLE_REMOTE_FAST_PRIMARY = process.env.ENABLE_REMOTE_FAST_PRIMARY === "true";

// Local Ollama (development-only fallback)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "hf.co/Qwen/Qwen3.5-35B-A3B";

// Final cloud fallback must use the GA model id, not preview.
const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const HERMES_AGENTIC_SYSTEM_PROMPT = `You are an autonomous AI agent with access to tools. When given a task:

1. EXECUTE immediately — do not describe what you will do, just do it.
2. Use the provided tools to accomplish the task. Call them directly.
3. If a tool call returns a result, use it to continue toward the goal.
4. Only respond in plain text when the task is fully complete or you need clarification.
5. Never say "I would do X" — either do X using a tool call, or explain why you cannot.

You are action-oriented. Bias toward execution over explanation.`;

const HERMES_THINKING_SYSTEM_PROMPT =
  `You are a deep thinking AI, you may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering. You should enclose your thoughts and internal monologue inside <think> </think> tags, and then provide your solution or response to the problem.`;

export interface HermesTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface HermesToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface HermesStreamResultWithTools extends StreamResult {
  toolCalls?: HermesToolCall[];
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function normalizeHttpUrl(url?: string): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return null;
}

export class HermesProvider implements LLMProvider {
  id = "hermes";
  name = "Hermes4 (Fast)";

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions & { thinking?: boolean; tools?: HermesTool[]; agentic?: boolean } = {}
  ): Promise<HermesStreamResultWithTools> {
    const formattedMessages: { role: string; content: string }[] = [];
    const useThinking = options.thinking === true;
    const hasTools = options.tools && options.tools.length > 0;
    const useAgentic = (options.agentic === true || hasTools);

    let systemPrompt = systemInstruction ?? "";

    if (useThinking) {
      systemPrompt = systemPrompt
        ? `${HERMES_THINKING_SYSTEM_PROMPT}\n\n${systemPrompt}`
        : HERMES_THINKING_SYSTEM_PROMPT;
    }

    if (useAgentic) {
      systemPrompt = systemPrompt
        ? `${HERMES_AGENTIC_SYSTEM_PROMPT}\n\n${systemPrompt}`
        : HERMES_AGENTIC_SYSTEM_PROMPT;
    }

    if (systemPrompt) {
      formattedMessages.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === "model" ? "assistant" : msg.role,
        content: msg.text,
      });
    }

    const remoteFastUrl = normalizeHttpUrl(LAMBDA_OLLAMA_URL);
    const production = isProductionRuntime();

    // Production policy:
    //   1. Nous primary if fully configured
    //   2. Gemini fallback
    //   3. Optional remote fast only if explicitly enabled + valid
    // Development policy:
    //   1. Optional remote fast if valid
    //   2. Nous if configured
    //   3. Local Ollama
    //   4. Gemini fallback

    if (production) {
      if (NOUS_API_KEY && NOUS_MODEL) {
        try {
          logger.info("[HermesProvider] Routing to Nous AI primary in production");
          return await this.streamFromNousAI(formattedMessages, options, useThinking);
        } catch (err) {
          logger.warn("[HermesProvider] Nous AI primary failed, falling back to Gemini", err);
        }
      } else {
        logger.warn("[HermesProvider] Nous primary disabled in production: missing NOUSE_API_KEY or NOUS_MODEL_ID");
      }

      if (ENABLE_REMOTE_FAST_PRIMARY && remoteFastUrl) {
        try {
          const remoteUp = await this.pingOllamaEndpoint(remoteFastUrl);
          if (remoteUp) {
            logger.info("[HermesProvider] Routing to explicitly enabled remote fast model in production");
            return await this.streamFromOllamaEndpoint(remoteFastUrl, formattedMessages, options);
          }
        } catch (err) {
          logger.warn("[HermesProvider] Explicit remote fast production path failed, falling back to Gemini", err);
        }
      } else if (ENABLE_REMOTE_FAST_PRIMARY && !remoteFastUrl) {
        logger.warn("[HermesProvider] Remote fast production path enabled but LAMBDA_OLLAMA_URL is invalid");
      }

      logger.info("[HermesProvider] Using Gemini Flash-Lite fallback in production");
      return await this.streamFromGeminiFallback(formattedMessages, systemInstruction, options);
    }

    if (remoteFastUrl) {
      try {
        const remoteUp = await this.pingOllamaEndpoint(remoteFastUrl);
        if (remoteUp) {
          logger.info("[HermesProvider] Routing to remote fast model in development");
          return await this.streamFromOllamaEndpoint(remoteFastUrl, formattedMessages, options);
        }
      } catch (err) {
        logger.warn("[HermesProvider] Remote fast dev path failed, continuing fallback chain", err);
      }
    }

    if (NOUS_API_KEY && NOUS_MODEL) {
      try {
        logger.info("[HermesProvider] Routing to Nous AI in development");
        return await this.streamFromNousAI(formattedMessages, options, useThinking);
      } catch (err) {
        logger.warn("[HermesProvider] Nous AI dev path failed, continuing fallback chain", err);
      }
    }

    try {
      const ollamaUp = await this.pingOllamaEndpoint(OLLAMA_BASE_URL);
      if (ollamaUp) {
        logger.info("[HermesProvider] Routing to local Ollama fallback in development");
        return await this.streamFromOllamaEndpoint(OLLAMA_BASE_URL, formattedMessages, options);
      }
    } catch (err) {
      logger.warn("[HermesProvider] Local Ollama unavailable, falling back to Gemini Flash-Lite", err);
    }

    // 4. Final cloud fallback
    return await this.streamFromGeminiFallback(formattedMessages, systemInstruction, options);
  }

  private async streamFromNousAI(
    messages: { role: string; content: string }[],
    options: CompletionOptions & { tools?: HermesTool[] },
    useThinking: boolean
  ): Promise<HermesStreamResultWithTools> {
    const body: Record<string, unknown> = {
      model: NOUS_MODEL,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${NOUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOUS_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Nous AI (${response.status}): ${errText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const bodyStream = response.body;
    const accumulatedToolCalls: Map<number, HermesToolCall> = new Map();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = bodyStream.getReader();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "data: [DONE]") continue;
              if (!trimmed.startsWith("data: ")) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json?.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx: number = tc.index ?? 0;
                    if (!accumulatedToolCalls.has(idx)) {
                      accumulatedToolCalls.set(idx, {
                        id: tc.id ?? `call_${idx}`,
                        type: "function",
                        function: { name: tc.function?.name ?? "", arguments: "" },
                      });
                    }
                    const existing = accumulatedToolCalls.get(idx)!;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                    if (tc.id) existing.id = tc.id;
                  }
                }

                const text = delta.content ?? "";
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // skip malformed chunk
              }
            }
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return {
      stream,
      toolCalls: Array.from(accumulatedToolCalls.values()),
      debug: {
        model: `nous/${NOUS_MODEL}${useThinking ? " (thinking)" : ""}`,
      },
    };
  }

  private async pingOllamaEndpoint(baseUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async streamFromOllamaEndpoint(
    baseUrl: string,
    messages: { role: string; content: string }[],
    options: CompletionOptions & { tools?: HermesTool[]; agentic?: boolean }
  ): Promise<HermesStreamResultWithTools> {
    const body: Record<string, unknown> = {
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama-compatible endpoint (${response.status}): ${errText}`);
    }

    return {
      stream: response.body,
      debug: {
        model: `ollama/${OLLAMA_MODEL}`,
      },
    };
  }

  private async streamFromGeminiFallback(
    messages: { role: string; content: string }[],
    systemInstruction?: string,
    options: CompletionOptions = {}
  ): Promise<HermesStreamResultWithTools> {
    const gemini = new (await import('./gemini')).GeminiProvider();
    return gemini.generateStream(
      messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : m.role, text: m.content } as ChatMessage)),
      systemInstruction,
      {
        ...options,
        model: FALLBACK_MODEL,
      }
    );
  }
}
