import type { AgentMode, LLMProvider } from '@/lib/llm/types';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { HermesProvider } from '@/lib/llm/providers/hermes';
import type { UcolProviderPlan } from './types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';

const FAST_MODEL = process.env.HERMES_MODEL_ID || 'hermes3';
const QUALITY_MODEL = 'gemini-3.1-pro-preview';
const AGENTIC_MODEL = 'claude-sonnet-4-6';
const REASONING_MODEL = 'deepseek-r1';

export type ProviderResolutionInput = {
  mode: AgentMode;
  hasAttachments?: boolean;
  providerKeys?: ProviderApiKeys;
};

export type ProviderResolution = {
  providerId: 'gemini' | 'claude' | 'deepseek' | 'hermes';
  execution: {
    provider: LLMProvider;
    modelId: string;
  };
  routing: UcolProviderPlan;
  reason: string;
};

export function resolveProviderForMode(input: ProviderResolutionInput): ProviderResolution {
  const { mode, hasAttachments = false, providerKeys = {} } = input;

  if (mode === 'agentic') {
    return {
      providerId: 'claude',
      execution: {
        provider: new ClaudeProvider(providerKeys.anthropic),
        modelId: AGENTIC_MODEL,
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['claude.agentic'],
        fallbackModelRefs: ['gemini.quality'],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'agentic mode routes to Claude orchestrator',
    };
  }

  if (mode === 'reasoning') {
    return {
      providerId: 'deepseek',
      execution: {
        provider: new DeepSeekProvider(),
        modelId: REASONING_MODEL,
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['deepseek.reasoning'],
        fallbackModelRefs: ['gemini.quality'],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'reasoning mode routes to DeepSeek reasoning model',
    };
  }

  if (mode === 'fast') {
    return {
      providerId: 'hermes',
      execution: {
        provider: new HermesProvider(providerKeys),
        modelId: FAST_MODEL,
      },
      routing: {
        selectionStrategy: 'primary_plus_fallback',
        preferredModelRefs: ['hermes.fast'],
        fallbackModelRefs: hasAttachments ? ['gemini.quality'] : ['gemini.fast_fallback'],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: hasAttachments
        ? 'fast mode routes to Hermes with stronger Gemini fallback for attachment-bearing requests'
        : 'fast mode routes to Hermes with Gemini fast fallback',
    };
  }

  return {
    providerId: 'gemini',
    execution: {
      provider: new GeminiProvider(providerKeys.google),
      modelId: QUALITY_MODEL,
    },
    routing: {
      selectionStrategy: 'single_model',
      preferredModelRefs: ['gemini.quality'],
      fallbackModelRefs: ['claude.agentic'],
      embeddingLanePreference: ['primary_768', 'secondary_3072'],
    },
    reason: 'quality mode routes to Gemini quality model',
  };
}
