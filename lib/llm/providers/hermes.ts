import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

/**
 * Hermes3 Provider — NousResearch Hermes-3 via Nous AI Cloud API
 *
 * Used for the "Fast" toggle in the UCOL conversation engine.
 * Hermes-3 (NousResearch) is a strong instruction-following model
 * optimized for low latency and high quality reasoning.
 *
 * Primary: Nous AI Cloud API (NOUSE_API_KEY required)
 *   Endpoint: https://api.nous.ai/v1
 *   Model: Hermes-3-405B or hermes-3-llama-3.1-70b
 *
 * Fallback 1: Ollama local inference (OLLAMA_BASE_URL, no key needed)
 * Fallback 2: Gemini Flash-Lite (always available, cost $0.10/1M tokens)
 */

const NOUS_API_KEY = process.env.NOUSE_API_KEY;

// Nous Research inference API (portal.nous.ai)
// Override via HERMES_BASE_URL env var if needed
const NOUS_BASE_URL =
  process.env.HERMES_BASE_URL || "https://api.nous.ai/v1";

// Model ID from the Nous portal — confirmed as "Hermes-4-70B" on portal UI
// Override via HERMES_MODEL_ID env var if needed
const NOUS_MODEL =
  process.env.HERMES_MODEL_ID || "Hermes-4-70B";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = "hermes3";

const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

export class HermesProvider implements LLMProvider {
  id = "hermes";
  name = "Hermes3 (Fast)";

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions = {}
  ): Promise<StreamResult> {
    const formattedMessages: { role: string; content: string }[] = [];

    // Hermes-4 supports native chain-of-thought via <think></think> tags.
    // Prepend the deep-thinking system prompt to activate it, then append
    // any caller-provided system instruction.
    const hermesSystemPrompt = `You are a deep thinking AI. You may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering. You should enclose your thoughts and internal monologue inside <think> </think> tags, and then provide your solution or response to the problem.`;

    const combinedSystem = systemInstruction
      ? `${hermesSystemPrompt}\n\n${systemInstruction}`
      : hermesSystemPrompt;

    formattedMessages.push({ role: "system", content: combinedSystem });

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === "model" ? "assistant" : msg.role,
        content: msg.text,
      });
    }

    // --- 1. Nous AI Cloud (primary) ---
    if (NOUS_API_KEY) {
      try {
        return await this.streamFromNousAI(formattedMessages, options);
      } catch (err) {
        logger.warn("[HermesProvider] Nous AI request failed, trying Ollama fallback", err);
      }
    }

    // --- 2. Ollama local (dev fallback) ---
    try {
      const ollamaAvailable = await this.pingOllama();
      if (ollamaAvailable) {
        return await this.streamFromOllama(formattedMessages, options);
      }
    } catch (err) {
      logger.warn("[HermesProvider] Ollama unavailable, falling back to Gemini Flash-Lite", err);
    }

    // --- 3. Gemini Flash-Lite (always-available fallback) ---
    return await this.streamFromGeminiFallback(formattedMessages, systemInstruction, options);
  }

  // ─── Nous AI Cloud ────────────────────────────────────────────────────────

  private async streamFromNousAI(
    messages: { role: string; content: string }[],
    options: CompletionOptions
  ): Promise<StreamResult> {
    const response = await fetch(`${NOUS_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOUS_API_KEY}`,
      },
      body: JSON.stringify({
        model: NOUS_MODEL,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Nous AI request failed (${response.status}): ${errText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const body = response.body;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
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
                const delta = json?.choices?.[0]?.delta?.content;
                if (delta) controller.enqueue(encoder.encode(delta));
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

    return { stream, debug: { model: `nous/${NOUS_MODEL}` } };
  }

  // ─── Ollama Local ─────────────────────────────────────────────────────────

  private async pingOllama(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async streamFromOllama(
    messages: { role: string; content: string }[],
    options: CompletionOptions
  ): Promise<StreamResult> {
    const response = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const body = response.body;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
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
                const delta = json?.choices?.[0]?.delta?.content;
                if (delta) controller.enqueue(encoder.encode(delta));
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

    return { stream, debug: { model: `ollama/${OLLAMA_MODEL}` } };
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
