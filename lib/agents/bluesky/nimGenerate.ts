/**
 * lib/agents/bluesky/nimGenerate.ts
 *
 * Shared inference helper for the Bluesky agents: NVIDIA NIM (DeepSeek-V4-Pro)
 * primary, Gemini (gemini-2.5-flash) as defensive fallback.
 *
 * Single-call pass — DeepSeek-V4-Pro resolves internal chain-of-thought natively,
 * and a tight maxTokens budget (250) leaves room for reasoning before the concise
 * reply/post payload, which downstream code then clips to the Bluesky char limit.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NvidiaNimProvider, NIM_MODEL_DEEPSEEK_V4_PRO } from '@/lib/llm/providers/nvidiaNim';

/** NIM generation defaults tuned for the serverless cron budget. */
const NIM_MAX_TOKENS = 250;
const NIM_TEMPERATURE = 0.7;

function geminiApiKey(): string {
  return process.env.BLUESKY_GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
}

async function generateWithNim(prompt: string, systemPrompt: string): Promise<string> {
  const provider = new NvidiaNimProvider();
  const result = await provider.generateStream(
    [{ role: 'user', text: prompt }],
    systemPrompt,
    {
      model: NIM_MODEL_DEEPSEEK_V4_PRO,
      maxTokens: NIM_MAX_TOKENS,
      temperature: NIM_TEMPERATURE,
    },
  );

  const reader = result.stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  const cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  if (!cleaned) throw new Error('NIM returned empty content');
  return cleaned;
}

async function generateWithGemini(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error('Missing BLUESKY_GEMINI_API_KEY or GOOGLE_API_KEY');
  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { role: 'user', parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: NIM_MAX_TOKENS, temperature: NIM_TEMPERATURE },
  });
  return result.response.text().trim();
}

/**
 * Unified generation entrypoint: NIM primary, Gemini fallback.
 * Returns the generated text (raw; caller enforces char limits).
 */
export async function nimGenerate(prompt: string, systemPrompt: string): Promise<string> {
  try {
    return await generateWithNim(prompt, systemPrompt);
  } catch (err) {
    console.warn('[Bluesky][nimGenerate] NIM generation failed, falling back to Gemini:', err);
    return generateWithGemini(prompt, systemPrompt);
  }
}