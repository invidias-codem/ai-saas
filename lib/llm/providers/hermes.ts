import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

/**
 * Hermes Provider — Self-hosted Ollama (Lambda Labs) + Nous Research Inference API
 *
 * Routing priority (UCOL T-027):
 *   1. Lambda Labs Ollama (self-hosted Hermes 3 8B) — primary, zero API cost
 *   2. Nous AI Cloud (Hermes-4.3-36B)        — fallback when Lambda Labs unavailable
 *   3. Gemini Flash-Lite                       — always-available last resort
 *
 * Lambda Labs Ollama endpoint: set LAMBDA_OLLAMA_URL env var to the internal K8s service
 *   e.g. http://ollama.ollama.svc.cluster.local:11434 (in-cluster)
 *        or https://ollama.gen1e.xyz (external via ingress)
 *
 * Nous AI docs: https://portal.nousresearch.com/api-docs
 * Rate: 100 req/min, 80k tokens/min
 *
 * Tool Calling (T-040):
 *   Hermes 3/4 fully supports OpenAI-format function calling. Tools are passed
 *   via the `tools` array in the request body. The model emits tool_calls in
 *   the delta when it decides to invoke a function. The caller is responsible
 *   for executing the tool and appending the result as a tool message.
 */

const NOUS_API_KEY = process.env.NOUSE_API_KEY;

// ── Security: base URL is hardcoded — never env-overridable (CVE-2025-59536) ──
// Allowing an env override would let an attacker exfiltrate NOUS_API_KEY by
// pointing HERMES_BASE_URL at a controlled server. Model ID is safe to configure.
const NOUS_BASE_URL = "https://inference-api.nousresearch.com/v1";

const NOUS_MODEL = process.env.HERMES_MODEL_ID || "Hermes-4.3-36B";

// Lambda Labs Ollama (primary) — internal K8s service or external ingress URL
const LAMBDA_OLLAMA_URL = process.env.LAMBDA_OLLAMA_URL || "";
// Local Ollama (dev) — fallback for local development
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "hermes3";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

// ── Agentic System Prompt (T-040) ─────────────────────────────────────────────
// Instructs Hermes to execute tools immediately rather than describing them.
// This is the root fix for the "empty call to action" problem — without an
// explicit directive, Hermes defaults to describing what it *would* do.
const HERMES_AGENTIC_SYSTEM_PROMPT = `You are an autonomous AI agent with access to tools. When given a task:

1. EXECUTE immediately — do not describe what you will do, just do it.
2. Use the provided tools to accomplish the task. Call them directly.
3. If a tool call returns a result, use it to continue toward the goal.
4. Only respond in plain text when the task is fully complete or you need clarification.
5. Never say "I would do X" — either do X using a tool call, or explain why you cannot.

You are action-oriented. Bias toward execution over explanation.`;

// Reasoning system prompt from Nous docs
const HERMES_THINKING_SYSTEM_PROMPT =
  `You are a deep thinking AI, you may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering. You should enclose your thoughts and internal monologue inside <think> </think> tags, and then provide your solution or response to the problem.`;

// ── OpenAI-format Tool Definition ────────────────────────────────────────────
export interface HermesTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema object
  };
}

export interface HermesToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface HermesStreamResultWithTools extends StreamResult {
  toolCalls?: HermesToolCall[];
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

    // Reasoning is opt-in — Fast mode keeps it OFF for low latency.
    // Pass options.thinking = true for deeper queries that benefit from CoT.
    const useThinking = options.thinking === true;

    // Agentic mode: prepend the execution-focused system prompt so the model
    // acts rather than describes. Only injected when tools are provided.
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

    // 1. Lambda Labs Ollama (self-hosted Hermes 3 — zero API cost, primary for UCOL Fast tier)
    if (LAMBDA_OLLAMA_URL) {
      try {
        const gkeUp = await this.pingOllamaEndpoint(LAMBDA_OLLAMA_URL);
        if (gkeUp) {
          logger.info("[HermesProvider] Routing to Lambda Labs Ollama (self-hosted)");
          return await this.streamFromOllamaEndpoint(LAMBDA_OLLAMA_URL, formattedMessages, options);
        }
      } catch (err) {
        logger.warn("[HermesProvider] Lambda Labs Ollama unavailable, falling back to Nous AI", err);
      }
    }

    // 2. Nous AI Cloud (API fallback when Lambda Labs unavailable)
    if (NOUS_API_KEY) {
      try {
        return await this.streamFromNousAI(formattedMessages, options, useThinking);
      } catch (err) {
        logger.warn("[HermesProvider] Nous AI request failed, trying local Ollama", err);
      }
    }

    // 3. Local Ollama (dev fallback)
    try {
      const ollamaUp = await this.pingOllamaEndpoint(OLLAMA_BASE_URL);
      if (ollamaUp) {
        return await this.streamFromOllamaEndpoint(OLLAMA_BASE_URL, formattedMessages, options);
      }
    } catch (err) {
      logger.warn("[HermesProvider] Local Ollama unavailable, falling back to Gemini Flash-Lite", err);
    }

    // 4. Gemini Flash-Lite (always-available last resort)
    return await this.streamFromGeminiFallback(formattedMessages, systemInstruction, options);
  }

  // ─── Nous AI Cloud ────────────────────────────────────────────────────────

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

    // Wire tools into Nous AI request (OpenAI-compatible format)
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

    // Accumulate tool calls across streaming chunks (they arrive fragmented)
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

                // Accumulate tool_calls deltas
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

                // Stream text content (final answer after tool calls)
                const text = delta.content ?? "";
                if (text) controller.enqueue(encoder.encode(text));

              } catch {
                // skip malformed chunk
              }
            }
          }
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    const toolCalls = accumulatedToolCalls.size > 0
      ? Array.from(accumulatedToolCalls.values())
      : undefined;

    return {
      stream,
      toolCalls,
      debug: {
        model: `nous/${NOUS_MODEL}${useThinking ? " (thinking)" : ""}${toolCalls ? ` (${toolCalls.length} tool_calls)` : ""}`,
      },
    };
  }

  // ─── Ollama (Lambda Labs or local) ────────────────────────────────────────────────

  private async pingOllamaEndpoint(baseUrl: string): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async streamFromOllamaEndpoint(
    baseUrl: string,
    messages: { role: string; content: string }[],
    options: CompletionOptions & { tools?: HermesTool[] }
  ): Promise<HermesStreamResultWithTools> {
    const isGke = baseUrl === LAMBDA_OLLAMA_URL && !!LAMBDA_OLLAMA_URL;

    const body: Record<string, unknown> = {
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    };

    // Wire tools into Ollama request (also OpenAI-compatible via /v1/chat/completions)
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = "auto";
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama (${response.status}): ${response.statusText}`);
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

                // Accumulate tool_calls
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

                const delta_text = delta.content ?? "";
                if (delta_text) controller.enqueue(encoder.encode(delta_text));
              } catch {
                // skip malformed chunk
              }
            }
          }
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    const toolCalls = accumulatedToolCalls.size > 0
      ? Array.from(accumulatedToolCalls.values())
      : undefined;

    const source = isGke ? `ollama-gke/${OLLAMA_MODEL}` : `ollama-local/${OLLAMA_MODEL}`;
    return {
      stream,
      toolCalls,
      debug: { model: source + (toolCalls ? ` (${toolCalls.length} tool_calls)` : "") },
    };
  }

  // ─── Gemini Flash-Lite Fallback ───────────────────────────────────────────

  private async streamFromGeminiFallback(
    messages: { role: string; content: string }[],
    systemInstruction: string | undefined,
    options: CompletionOptions
  ): Promise<StreamResult> {
    const { GeminiProvider } = await import("./gemini");
    const gemini = new GeminiProvider();

    const { ChatMessageSchema } = await import("../types");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) =>
        ChatMessageSchema.parse({
          role: m.role === "assistant" ? "model" : m.role,
          text: m.content,
        })
      );

    return gemini.generateStream(chatMessages, systemInstruction, {
      ...options,
      model: FALLBACK_MODEL,
    });
  }
}
