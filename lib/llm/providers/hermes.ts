import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from "../types";
import { logger } from "@/lib/logger";

/**
 * Hermes Provider — Self-hosted Ollama (GKE) + Nous Research Inference API
 *
 * Routing priority (UCOL T-027):
 *   1. GKE Ollama (self-hosted Hermes 3 8B) — primary, zero API cost
 *   2. Nous AI Cloud (Hermes-4.3-36B)        — fallback when GKE unavailable
 *   3. Gemini Flash-Lite                       — always-available last resort
 *
 * GKE Ollama endpoint: set OLLAMA_GKE_URL env var to the internal K8s service
 *   e.g. http://ollama.ollama.svc.cluster.local:11434 (in-cluster)
 *        or https://ollama.gen1e.xyz (external via ingress)
 *
 * Nous AI docs: https://portal.nousresearch.com/api-docs
 * Rate: 100 req/min, 80k tokens/min
 */

const NOUS_API_KEY = process.env.NOUSE_API_KEY;

// ── Security: base URL is hardcoded — never env-overridable (CVE-2025-59536) ──
// Allowing an env override would let an attacker exfiltrate NOUS_API_KEY by
// pointing HERMES_BASE_URL at a controlled server. Model ID is safe to configure.
const NOUS_BASE_URL = "https://inference-api.nousresearch.com/v1";

const NOUS_MODEL = process.env.HERMES_MODEL_ID || "Hermes-4.3-36B";

// GKE Ollama (primary) — internal K8s service or external ingress URL
const OLLAMA_GKE_URL = process.env.OLLAMA_GKE_URL || "";
// Local Ollama (dev) — fallback for local development
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "hermes3";
const FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

// Reasoning system prompt from Nous docs
const HERMES_THINKING_SYSTEM_PROMPT =
  `You are a deep thinking AI, you may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering. You should enclose your thoughts and internal monologue inside <think> </think> tags, and then provide your solution or response to the problem.`;

export class HermesProvider implements LLMProvider {
  id = "hermes";
  name = "Hermes4 (Fast)";

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions & { thinking?: boolean } = {}
  ): Promise<StreamResult> {
    const formattedMessages: { role: string; content: string }[] = [];

    // Reasoning is opt-in — Fast mode keeps it OFF for low latency.
    // Pass options.thinking = true for deeper queries that benefit from CoT.
    const useThinking = options.thinking === true;

    if (useThinking) {
      // Prepend Nous reasoning system prompt, then caller instruction
      const combinedSystem = systemInstruction
        ? `${HERMES_THINKING_SYSTEM_PROMPT}\n\n${systemInstruction}`
        : HERMES_THINKING_SYSTEM_PROMPT;
      formattedMessages.push({ role: "system", content: combinedSystem });
    } else if (systemInstruction) {
      formattedMessages.push({ role: "system", content: systemInstruction });
    }

    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === "model" ? "assistant" : msg.role,
        content: msg.text,
      });
    }

    // 1. GKE Ollama (self-hosted Hermes 3 — zero API cost, primary for UCOL Fast tier)
    if (OLLAMA_GKE_URL) {
      try {
        const gkeUp = await this.pingOllamaEndpoint(OLLAMA_GKE_URL);
        if (gkeUp) {
          logger.info("[HermesProvider] Routing to GKE Ollama (self-hosted)");
          return await this.streamFromOllamaEndpoint(OLLAMA_GKE_URL, formattedMessages, options);
        }
      } catch (err) {
        logger.warn("[HermesProvider] GKE Ollama unavailable, falling back to Nous AI", err);
      }
    }

    // 2. Nous AI Cloud (API fallback when GKE unavailable)
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
    options: CompletionOptions,
    useThinking: boolean
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
      throw new Error(`Nous AI (${response.status}): ${errText}`);
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
                const delta = json?.choices?.[0]?.delta;
                if (!delta) continue;

                // When reasoning is ON, Hermes 4 sends thinking to `reasoning_content`
                // and the final answer to `content`. We stream only the answer.
                // When reasoning is OFF, everything comes through `content` directly.
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

    return {
      stream,
      debug: {
        model: `nous/${NOUS_MODEL}${useThinking ? " (thinking)" : ""}`,
      },
    };
  }

  // ─── Ollama (GKE or local) ────────────────────────────────────────────────

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
    options: CompletionOptions
  ): Promise<StreamResult> {
    const isGke = baseUrl === OLLAMA_GKE_URL && !!OLLAMA_GKE_URL;
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
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
      throw new Error(`Ollama (${response.status}): ${response.statusText}`);
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

    const source = isGke ? `ollama-gke/${OLLAMA_MODEL}` : `ollama-local/${OLLAMA_MODEL}`;
    return { stream, debug: { model: source } };
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
