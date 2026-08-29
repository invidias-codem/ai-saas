// lib/ucol/prompts/nimChat.ts
// Shared non-streaming OpenAI-compatible completion helper for the UCOL
// Code Builder debate loop (planner / coder / reviewer). All three stages
// call Kimi K3 through the same NVIDIA NIM endpoint.
import { nvidiaNimConfig } from '@/lib/env';

const NIM_MODEL_KIMI_K3 = 'moonshotai/kimi-k3';

export interface NimChatResult {
  text: string;
  model: string;
}

/**
 * Non-streaming completion against NVIDIA NIM.
 * Returns the full assistant text (JSON expected by callers).
 */
export async function nimChat(
  systemPrompt: string,
  userPrompt: string,
  opts: { model?: string; temperature?: number; maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' | 'max' } = {}
): Promise<NimChatResult> {
  const cfg = nvidiaNimConfig();
  if (!cfg) {
    throw new Error('[NIM] NVIDIA_API_KEY is not set. Code Builder requires NVIDIA NIM.');
  }

  const body: Record<string, unknown> = {
    model: opts.model || NIM_MODEL_KIMI_K3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: opts.maxTokens ?? 8192,
    temperature: opts.temperature ?? 0.7,
    top_p: 0.95,
    stream: false,
    chat_template_kwargs: { thinking: false },
  };
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(`[NIM] request failed: ${err?.message ?? String(err)}`);
  }

  clearTimeout(timer);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`[NIM] HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const json = await response.json().catch(() => null);
  const text = json?.choices?.[0]?.message?.content ?? '';
  return { text, model: (opts.model || NIM_MODEL_KIMI_K3) };
}

export { NIM_MODEL_KIMI_K3 };