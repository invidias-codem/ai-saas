"use strict";
/**
 * RFC-001: World Model Root of Trust (WMRT) — Trust Tagging Utility
 *
 * All LLM output entering the UCOL memory layer MUST be tagged with a trust tier
 * before storage. Raw model output is always UNVERIFIED at write time.
 * Only the DeltaEngine can upgrade trust to CONFIRMED or SUPPORTED.
 *
 * Usage:
 *   import { tagLLMMessage, tagUserMessage, tagMessagesForStorage } from '@/lib/world-model/trustTag';
 *
 *   // Tag a single assistant turn before pushing to memory:
 *   const tagged = tagLLMMessage(responseText, 'gemini-3.1-flash-lite-preview');
 *
 *   // Tag a full conversation history before captureMemory():
 *   const safeMessages = tagMessagesForStorage(formattedMessages, modelId);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tagLLMMessage = tagLLMMessage;
exports.tagUserMessage = tagUserMessage;
exports.tagSystemMessage = tagSystemMessage;
exports.tagMessagesForStorage = tagMessagesForStorage;
exports.promoteMessageTrust = promoteMessageTrust;
exports.extractWMRTMetadata = extractWMRTMetadata;
// ─────────────────────────────────────────────
// Core tagging functions
// ─────────────────────────────────────────────
/**
 * Tag a raw LLM-generated assistant message as UNVERIFIED.
 * This is the ONLY correct way to create an assistant message for storage.
 */
function tagLLMMessage(content, sourceModel) {
    return {
        role: 'assistant',
        content,
        trust_tier: 'UNVERIFIED',
        tagged_at: new Date().toISOString(),
        source_model: sourceModel,
    };
}
/**
 * Tag a user-submitted message.
 * User messages are UNVERIFIED by default — they are assertions, not ground truth.
 */
function tagUserMessage(content) {
    return {
        role: 'user',
        content,
        trust_tier: 'UNVERIFIED',
        tagged_at: new Date().toISOString(),
    };
}
/**
 * Tag a system-generated message (e.g. system prompt injections).
 * Use SUPPORTED for system messages that reference known-good context;
 * use UNVERIFIED for dynamically assembled system prompts.
 */
function tagSystemMessage(content, tier = 'UNVERIFIED') {
    return {
        role: 'system',
        content,
        trust_tier: tier,
        tagged_at: new Date().toISOString(),
    };
}
// ─────────────────────────────────────────────
// Bulk conversion for captureMemory() calls
// ─────────────────────────────────────────────
/**
 * Convert a plain { role, content } message array into TrustTaggedMessage[].
 * Used to annotate conversation history before it enters the memory layer.
 *
 * - assistant messages → UNVERIFIED (raw LLM output, not yet delta-scored)
 * - user messages      → UNVERIFIED (user assertions, not ground truth)
 * - system messages    → UNVERIFIED (conservative default)
 *
 * @param messages       Plain message array from the conversation history
 * @param assistantModel The model ID that produced assistant turns (for provenance)
 */
function tagMessagesForStorage(messages, assistantModel) {
    const now = new Date().toISOString();
    return messages.map((msg) => {
        const role = msg.role === 'bot' ? 'assistant' : msg.role;
        return {
            role,
            content: msg.content,
            trust_tier: 'UNVERIFIED',
            tagged_at: now,
            ...(role === 'assistant' && assistantModel ? { source_model: assistantModel } : {}),
        };
    });
}
// ─────────────────────────────────────────────
// Trust tier promotion (DeltaEngine use only)
// ─────────────────────────────────────────────
/**
 * Promote a tagged message to a higher trust tier after DeltaEngine scoring.
 * Only DeltaEngine should call this — never promote from application code.
 *
 * AXIOM cannot be assigned here — that path goes through the KMS attestation service.
 */
function promoteMessageTrust(msg, newTier, deltaScore) {
    // Never demote — if the message already holds a higher tier, keep it.
    const tierOrder = ['UNVERIFIED', 'SUPPORTED', 'CONFIRMED', 'AXIOM'];
    const currentRank = tierOrder.indexOf(msg.trust_tier);
    const newRank = tierOrder.indexOf(newTier);
    if (newRank <= currentRank)
        return msg;
    return {
        ...msg,
        trust_tier: newTier,
        delta_score: deltaScore,
        tagged_at: new Date().toISOString(), // re-stamp on promotion
    };
}
// ─────────────────────────────────────────────
// Metadata extraction (for captureMemory metadata param)
// ─────────────────────────────────────────────
/**
 * Extract WMRT provenance metadata suitable for passing as captureMemory()'s
 * `metadata` param. This ensures trust tier info is persisted alongside the memory.
 */
function extractWMRTMetadata(taggedMessages, assistantModel) {
    const assistantMsgs = taggedMessages.filter((m) => m.role === 'assistant');
    const unverifiedCount = assistantMsgs.filter((m) => m.trust_tier === 'UNVERIFIED').length;
    const avgDeltaScore = assistantMsgs.filter((m) => m.delta_score !== undefined).reduce((acc, m) => acc + (m.delta_score ?? 0), 0) /
        (assistantMsgs.filter((m) => m.delta_score !== undefined).length || 1);
    return {
        wmrt_tagged: true,
        wmrt_assistant_model: assistantModel,
        wmrt_unverified_turns: unverifiedCount,
        wmrt_avg_delta_score: isNaN(avgDeltaScore) ? null : avgDeltaScore,
        wmrt_tagged_at: new Date().toISOString(),
    };
}
