import type { AgentMode, LLMProvider } from '@/lib/llm/types';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { NvidiaNimProvider, NIM_MODEL_DEEPSEEK_V4_PRO, NIM_MODEL_KIMI_K3 } from '@/lib/llm/providers/nvidiaNim';
import type { UcolProviderPlan } from './types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';
import type { PersonaSession } from '@/lib/consultant/personaSession';

const QUALITY_MODEL = NIM_MODEL_DEEPSEEK_V4_PRO;
const AGENTIC_MODEL = NIM_MODEL_KIMI_K3;
const REASONING_MODEL = NIM_MODEL_DEEPSEEK_V4_PRO;
const FAST_MODEL = NIM_MODEL_DEEPSEEK_V4_PRO;

/** Gemini is retained as the multimodal fallback (attachments) and as the embedding engine. */
const GEMINI_ATTACHMENT_MODEL = 'gemini-3.1-pro-preview';

/** Rank order for model tiers — higher = more capable */
const TIER_RANK: Record<PersonaSession['minimumModelTier'], number> = {
  fast: 0,
  quality: 1,
  reasoning: 2,
};

export type ProviderResolutionInput = {
  mode: AgentMode;
  hasAttachments?: boolean;
  providerKeys?: ProviderApiKeys;
  /** Optional persona session — enforces minimum model tier */
  personaSession?: PersonaSession;
};

export type ProviderResolution = {
  providerId: 'gemini' | 'deepseek' | 'nvidia-nim';
  execution: {
    provider: LLMProvider;
    modelId: string;
  };
  routing: UcolProviderPlan;
  reason: string;
  /** True when persona minimum tier overrode the requested mode */
  personaOverride?: boolean;
};

/**
 * Resolve the best provider/model for the given mode.
 *
 * NVIDIA NIM is the primary inference layer:
 *   - DeepSeek V4 Pro  → chat / deep-thought / quality / reasoning
 *   - Kimi K3          → agentic (tool use)
 *   - Gemini           → multimodal attachments ONLY + embeddings
 *
 * When a persona session is active, the persona's minimumModelTier acts as
 * a cognitive floor — if the user selects 'fast' but the persona requires
 * 'reasoning', the resolver silently upgrades to the persona's minimum.
 */
export function resolveProviderForMode(input: ProviderResolutionInput): ProviderResolution {
  const { mode, hasAttachments = false, providerKeys = {}, personaSession } = input;

  let resolution = resolveBaseProvider(mode, hasAttachments, providerKeys);

  if (personaSession) {
    const personaTier = personaSession.minimumModelTier;
    const personaTierRank = TIER_RANK[personaTier];
    const requestedTierRank = getModeTierRank(mode);

    if (personaTierRank > requestedTierRank) {
      const upgraded = resolveBaseProvider(
        personaTier === 'reasoning' ? 'reasoning' : 'quality',
        hasAttachments,
        providerKeys
      );
      resolution = {
        ...upgraded,
        reason: `[Persona override] ${personaSession.personaId} requires ${personaTier} tier — upgraded from ${mode}`,
        personaOverride: true,
      };
    }
  }

  return resolution;
}

function getModeTierRank(mode: AgentMode): number {
  switch (mode) {
    case 'fast':
      return TIER_RANK.fast;
    case 'quality':
      return TIER_RANK.quality;
    case 'reasoning':
    case 'agentic':
      return TIER_RANK.reasoning;
    default:
      return TIER_RANK.fast;
  }
}

function resolveBaseProvider(
  mode: AgentMode,
  hasAttachments: boolean,
  _providerKeys: ProviderApiKeys
): ProviderResolution {

  // Attachments always route to Gemini — DeepSeek/Kimi on NIM are text-only.
  if (hasAttachments) {
    return {
      providerId: 'gemini',
      execution: {
        provider: new GeminiProvider(),
        modelId: GEMINI_ATTACHMENT_MODEL,
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['gemini.quality'],
        fallbackModelRefs: [],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'attachment-bearing request routes to Gemini (NIM DeepSeek/Kimi are text-only)',
    };
  }

  if (mode === 'agentic') {
    return {
      providerId: 'nvidia-nim',
      execution: {
        provider: new NvidiaNimProvider(),
        modelId: AGENTIC_MODEL,
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['nvidia-nim.agentic'],
        fallbackModelRefs: ['deepseek.quality'],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'agentic mode routes to Kimi K3 on NVIDIA NIM',
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
        fallbackModelRefs: [],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'reasoning mode routes to DeepSeek V4 Pro on NVIDIA NIM',
    };
  }

  if (mode === 'fast') {
    return {
      providerId: 'deepseek',
      execution: {
        provider: new DeepSeekProvider(),
        modelId: FAST_MODEL,
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['deepseek.fast'],
        fallbackModelRefs: [],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'fast mode routes to DeepSeek V4 Pro on NVIDIA NIM',
    };
  }

  // quality (default)
  return {
    providerId: 'deepseek',
    execution: {
      provider: new DeepSeekProvider(),
      modelId: QUALITY_MODEL,
    },
    routing: {
      selectionStrategy: 'single_model',
      preferredModelRefs: ['deepseek.quality'],
      fallbackModelRefs: [],
      embeddingLanePreference: ['primary_768', 'secondary_3072'],
    },
    reason: 'quality mode routes to DeepSeek V4 Pro on NVIDIA NIM',
  };
}