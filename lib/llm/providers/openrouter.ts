import { LLMProvider, ChatMessage, CompletionOptions, StreamResult } from '../types';
import { logger } from '@/lib/logger';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

export interface OpenRouterStreamResult extends StreamResult {
  toolCalls?: OpenRouterToolCall[];
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class OpenRouterProvider implements LLMProvider {
  id = 'openrouter';
  name = 'OpenRouter';

  constructor(private readonly providerKeys: ProviderApiKeys = {}) {}

  async generateStream(
    messages: ChatMessage[],
    systemInstruction?: string,
    options: CompletionOptions & { tools?: any[]; thinking?: boolean } = {}
  ): Promise<OpenRouterStreamResult> {
    const apiKey = this.providerKeys.openrouter || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key is not configured.');
    }

    const formattedMessages: Record<string, unknown>[] = [];
    if (systemInstruction) {
      formattedMessages.push({ role: 'system', content: systemInstruction });
    }
    for (const msg of messages) {
      formattedMessages.push({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.text,
      });
    }

    const body: Record<string, unknown> = {
      model: options.model || 'openrouter/auto',
      messages: formattedMessages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://lattice-os.local',
        'X-Title': 'Lattice OS',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`OpenRouter API Error: ${response.status} - ${errorText}`);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8');
    const accumulatedToolCalls = new Map<number, OpenRouterToolCall>();

    if (!response.body) {
      throw new Error('No response body received from OpenRouter.');
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === 'data: [DONE]') continue;
              if (!trimmed.startsWith('data: ')) continue;

              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json?.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!accumulatedToolCalls.has(idx)) {
                      accumulatedToolCalls.set(idx, {
                        id: tc.id ?? `call_${idx}`,
                        type: 'function',
                        function: { name: tc.function?.name ?? '', arguments: '' },
                      });
                    }
                    const existing = accumulatedToolCalls.get(idx)!;
                    if (tc.function?.name) existing.function.name = tc.function.name;
                    if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                    if (tc.id) existing.id = tc.id;
                  }
                }

                const text = delta.content ?? '';
                if (text) controller.enqueue(encoder.encode(text));
              } catch {
                // skip malformed chunk
              }
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          try { controller.close(); } catch {}
          reader.releaseLock();
        }
      },
    });

    return {
      stream,
      toolCalls: Array.from(accumulatedToolCalls.values()),
      debug: { model: `openrouter/${options.model || 'auto'}` },
    };
  }
}
