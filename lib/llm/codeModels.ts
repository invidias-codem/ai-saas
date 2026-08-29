import { CodeModelConfig } from './types';
import { NIM_MODEL_DEEPSEEK_V4_PRO, NIM_MODEL_KIMI_K3 } from './providers/nvidiaNim';

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
        provider: 'nvidia-nim',
        modelId: NIM_MODEL_DEEPSEEK_V4_PRO,
        description: 'DeepSeek V4 Pro on NVIDIA NIM — best reasoning and quality',
        maxTokens: 16384,
    },
    agentic: {
        id: 'agentic',
        name: 'Agentic',
        provider: 'nvidia-nim',
        modelId: NIM_MODEL_KIMI_K3,
        description: 'Kimi K3 on NVIDIA NIM — autonomous code execution and tool use',
        maxTokens: 16384,
        supportsCodeExecution: true,
    },
    reasoning: {
        id: 'reasoning',
        name: 'Reasoning',
        provider: 'nvidia-nim',
        modelId: NIM_MODEL_DEEPSEEK_V4_PRO,
        description: 'DeepSeek V4 Pro — advanced reasoning for complex problems',
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