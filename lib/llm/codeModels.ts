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
    'claude-3-5-sonnet': {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'claude',
        modelId: 'claude-3-5-sonnet-20241022',
        description: 'Artifact-friendly Sonnet for code, UI, and diagrams',
        maxTokens: 8192,
        supportsArtifacts: true,
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
    'openrouter-qwen3-coder-480b': {
        id: 'openrouter-qwen3-coder-480b',
        name: 'Qwen3 Coder 480B-A35B (OpenRouter)',
        provider: 'openrouter',
        modelId: 'qwen/qwen3-coder-480b-a35b',
        description: 'OpenRouter-backed Qwen3 Coder 480B-A35B',
        maxTokens: 8192,
    },
    'openrouter-kimi-k2.6': {
        id: 'openrouter-kimi-k2.6',
        name: 'Kimi K2.6 (OpenRouter)',
        provider: 'openrouter',
        modelId: 'moonshotai/kimi-k2.6',
        description: 'OpenRouter-backed Kimi K2.6 agentic coder',
        maxTokens: 16384,
    },
    'openrouter-kimi-k3': {
        id: 'openrouter-kimi-k3',
        name: 'Kimi K3 (OpenRouter)',
        provider: 'openrouter',
        modelId: 'moonshotai/kimi-k3',
        description: 'OpenRouter-backed Kimi K3 agentic coder',
        maxTokens: 16384,
    },
    'openrouter-deepseek-v4-pro': {
        id: 'openrouter-deepseek-v4-pro',
        name: 'DeepSeek V4 Pro (OpenRouter)',
        provider: 'openrouter',
        modelId: 'deepseek/deepseek-v4-pro',
        description: 'OpenRouter-backed DeepSeek V4 Pro heavy reasoning',
        maxTokens: 32768,
    },
    'openrouter-glm-5.2': {
        id: 'openrouter-glm-5.2',
        name: 'GLM-5.2 (OpenRouter)',
        provider: 'openrouter',
        modelId: 'z-ai/glm-5.2',
        description: 'OpenRouter-backed GLM-5.2 massive-context scaffold',
        maxTokens: 8192,
    },
    'openrouter-gpt-oss-120b': {
        id: 'openrouter-gpt-oss-120b',
        name: 'GPT-OSS 120B (OpenRouter)',
        provider: 'openrouter',
        modelId: 'nousresearch/gpt-oss-120b',
        description: 'OpenRouter-backed GPT-OSS 120B fast reasoning',
        maxTokens: 8192,
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
