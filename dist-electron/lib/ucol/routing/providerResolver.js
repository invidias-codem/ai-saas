"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProviderForMode = resolveProviderForMode;
const gemini_1 = require("@/lib/llm/providers/gemini");
const claude_1 = require("@/lib/llm/providers/claude");
const deepseek_1 = require("@/lib/llm/providers/deepseek");
const hermes_1 = require("@/lib/llm/providers/hermes");
const FAST_MODEL = process.env.HERMES_MODEL_ID || 'hermes3';
const QUALITY_MODEL = 'gemini-3.1-pro-preview';
const AGENTIC_MODEL = 'claude-sonnet-4-6';
const REASONING_MODEL = 'deepseek-r1';
function resolveProviderForMode(input) {
    const { mode, hasAttachments = false } = input;
    if (mode === 'agentic') {
        return {
            providerId: 'claude',
            execution: {
                provider: new claude_1.ClaudeProvider(),
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
                provider: new deepseek_1.DeepSeekProvider(),
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
                provider: new hermes_1.HermesProvider(),
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
            provider: new gemini_1.GeminiProvider(),
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
