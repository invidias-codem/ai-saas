import { CodeModelConfig } from './types';

export const CODE_MODELS: Record<string, CodeModelConfig> = {
    fast: {
        id: 'fast',
        name: 'Fast',
        provider: 'gemini',
        modelId: 'gemini-2.5-flash',
        description: 'Fastest response time for quick iterations',
        maxTokens: 8192,
    },
    quality: {
        id: 'quality',
        name: 'Quality',
        provider: 'claude',
        modelId: 'claude-sonnet-4-20250514',
        description: 'Best code quality and reasoning',
        maxTokens: 8192,
    },
    agentic: {
        id: 'agentic',
        name: 'Agentic',
        provider: 'gemini',
        modelId: 'gemini-2.5-pro',
        description: 'Autonomous code execution and tool use',
        maxTokens: 8192,
        supportsCodeExecution: true,
    },
    reasoning: {
        id: 'reasoning',
        name: 'Reasoning',
        provider: 'deepseek',
        modelId: 'deepseek-r1',
        description: 'Advanced reasoning for complex problems',
        maxTokens: 32768,
    },
    'openrouter-llama-4': {
        id: 'openrouter-llama-4',
        name: 'Llama 4 Maverick (OpenRouter)',
        provider: 'openrouter',
        modelId: 'meta/llama-4-maverick',
        description: 'OpenRouter-backed Llama 4 Maverick',
        maxTokens: 8192,
    },
    'openrouter-qwen3-235b': {
        id: 'openrouter-qwen3-235b',
        name: 'Qwen3 235B A22B (OpenRouter)',
        provider: 'openrouter',
        modelId: 'qwen/qwen3-235b-a22b',
        description: 'OpenRouter-backed Qwen3 235B MoE',
        maxTokens: 32768,
    },
    'openrouter-deepseek-r1': {
        id: 'openrouter-deepseek-r1',
        name: 'DeepSeek R1 (OpenRouter)',
        provider: 'openrouter',
        modelId: 'deepseek/deepseek-r1',
        description: 'OpenRouter-backed DeepSeek R1',
        maxTokens: 32768,
    },
};

export type ProviderKeyState = Record<string, { configured: boolean }>;

export function isModelVisibleForProviderState(modelId: string, providerKeyState: ProviderKeyState): boolean {
  const model = CODE_MODELS[modelId];
  if (!model) return true;
  const state = providerKeyState[model.provider];
  if (!state) return true;
  return state.configured;
}

export function filterVisibleModels(models: Record<string, CodeModelConfig>, providerKeyState: ProviderKeyState): Record<string, CodeModelConfig> {
  const out: Record<string, CodeModelConfig> = {};
  for (const [key, model] of Object.entries(models)) {
    if (isModelVisibleForProviderState(key, providerKeyState)) {
      out[key] = model;
    }
  }
  return out;
}
