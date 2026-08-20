import type { AgentMode, LLMProvider } from '@/lib/llm/types';
import { GeminiProvider } from '@/lib/llm/providers/gemini';
import { ClaudeProvider } from '@/lib/llm/providers/claude';
import { DeepSeekProvider } from '@/lib/llm/providers/deepseek';
import { HermesProvider } from '@/lib/llm/providers/hermes';
import { OpenRouterProvider } from '@/lib/llm/providers/openrouter';
import type { UcolProviderPlan } from './types';
import type { ProviderApiKeys } from '@/lib/userProviderKeys';
import type { PersonaSession } from '@/lib/consultant/personaSession';

const FAST_MODEL = process.env.HERMES_MODEL_ID || 'hermes3';
const QUALITY_MODEL = 'gemini-3.1-pro-preview';
const AGENTIC_MODEL = process.env.LATTICE_AGENTIC_MODEL || 'Hermes-4-70B';
const REASONING_MODEL = 'deepseek-r1';
const OPENROUTER_FAST_MODEL = process.env.OPENROUTER_FAST_MODEL || 'openrouter/auto';

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
  providerId: 'gemini' | 'claude' | 'deepseek' | 'hermes' | 'openrouter';
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
 * When a persona session is active, the persona's minimumModelTier acts as
 * a cognitive floor — if the user selects 'fast' but the persona requires
 * 'reasoning', the resolver silently upgrades to the persona's minimum.
 */
export function resolveProviderForMode(input: ProviderResolutionInput): ProviderResolution {
  const { mode, hasAttachments = false, providerKeys = {}, personaSession } = input;

  // Resolve the base provider for the requested mode
  let resolution = resolveBaseProvider(mode, hasAttachments, providerKeys);

  // Enforce persona minimum tier
  if (personaSession) {
    const personaTier = personaSession.minimumModelTier;
    const personaTierRank = TIER_RANK[personaTier];
    const requestedTierRank = getModeTierRank(mode);

    if (personaTierRank > requestedTierRank) {
      // Persona requires a more capable model — upgrade silently
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

/**
 * Map an agent mode to its tier rank for persona comparison.
 */
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

/**
 * Base provider resolution without persona enforcement.
 */
function resolveBaseProvider(
  mode: AgentMode,
  hasAttachments: boolean,
  providerKeys: ProviderApiKeys
): ProviderResolution {

  if (mode === 'agentic') {
    const nousConfigured = Boolean(providerKeys.nous || (process.env.NOUSE_API_KEY && process.env.NOUSE_API_KEY.trim()));
    const anthropicConfigured = Boolean(providerKeys.anthropic);

    if (nousConfigured || !anthropicConfigured) {
      return {
        providerId: 'hermes',
        execution: {
          provider: new HermesProvider(providerKeys),
          modelId: AGENTIC_MODEL,
        },
        routing: {
          selectionStrategy: 'primary_plus_fallback',
          preferredModelRefs: ['hermes.agentic'],
          fallbackModelRefs: ['gemini.quality', 'claude.agentic'],
          embeddingLanePreference: ['primary_768', 'secondary_3072'],
        },
        reason: nousConfigured
          ? 'agentic mode routes to Nous/Step via HermesProvider'
          : 'agentic mode defaults to Hermes/Nous; no Anthropic key configured',
      };
    }

    return {
      providerId: 'claude',
      execution: {
        provider: new ClaudeProvider(providerKeys.anthropic),
        modelId: 'claude-sonnet-4-6',
      },
      routing: {
        selectionStrategy: 'single_model',
        preferredModelRefs: ['claude.agentic'],
        fallbackModelRefs: ['gemini.quality'],
        embeddingLanePreference: ['primary_768', 'secondary_3072'],
      },
      reason: 'agentic mode routes to Claude orchestrator because Anthropic key is configured',
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
    const hasOpenRouterKey = Boolean(providerKeys.openrouter);
    if (hasOpenRouterKey) {
      return {
        providerId: 'openrouter',
        execution: {
          provider: new OpenRouterProvider(providerKeys),
          modelId: OPENROUTER_FAST_MODEL,
        },
        routing: {
          selectionStrategy: 'primary_plus_fallback',
          preferredModelRefs: ['openrouter.fast'],
          fallbackModelRefs: hasAttachments ? ['hermes.fast', 'gemini.quality'] : ['hermes.fast', 'gemini.fast_fallback'],
          embeddingLanePreference: ['primary_768', 'secondary_3072'],
        },
        reason: 'fast mode routes to OpenRouter when a user API key is configured',
      };
    }

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
