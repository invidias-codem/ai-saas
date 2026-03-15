import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

/**
 * Hermes3 Provider (via Ollama local inference)
 *
 * Used for the "Fast" toggle in the UCOL conversation engine.
 * Hermes3 (NousResearch) is a strong instruction-following model
 * optimized for low-latency, local inference with no API cost.
 *
 * Requires Ollama running locally: https://ollama.ai
 * Model pull: `ollama pull hermes3`
 *
 * Falls back to gemini-2.0-flash-lite if Ollama is unavailable.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const HERMES_MODEL = process.env.HERMES_MODEL_ID || "hermes3";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview"; // cost: $0.10/1M

export class HermesProvider implements LLMProvider {
  id = "hermes";
  name = "Hermes3 (Fast)";

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions = {}
  ): Promise<StreamResult> {
    // --- Build OpenAI-compatible message array ---
    const formattedMessages: { role: string; content: string }[] = [];

    if (systemInstruction) {
      formattedMessages.push({ role: "system", content: systemInstruction });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === "model" ? "assistant" : msg.role,
        content: msg.text,
      });
    }

    // --- Try Ollama first ---
    try {
      const ollamaAvailable = await this.pingOllama();

      if (ollamaAvailable) {
        return await this.streamFromOllama(formattedMessages, options);
      }
    } catch (err) {
      logger.warn("[HermesProvider] Ollama unavailable, falling back to Gemini Flash-Lite", err);
    }

    // --- Fallback: Gemini Flash-Lite (cheap + fast) ---
    return await this.streamFromGeminiFallback(formattedMessages, systemInstruction, options);
  }

  private async pingOllama(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: AbortSignal.timeout(1500), // 1.5s ping timeout
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
        model: HERMES_MODEL,
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

    return { stream, debug: { model: `ollama/${HERMES_MODEL}` } };
  }

  private async streamFromGeminiFallback(
    messages: { role: string; content: string }[],
    systemInstruction: string | undefined,
    options: CompletionOptions
  ): Promise<StreamResult> {
    // Lazy-import GeminiProvider to avoid circular deps
    const { GeminiProvider } = await import("./gemini");
    const gemini = new GeminiProvider();

    // Reconstruct ChatMessage array for Gemini
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
