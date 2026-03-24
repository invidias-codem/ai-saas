/**
 * lib/analytics/track.ts — Server-side Vercel Analytics event tracker
 *
 * Wraps @vercel/analytics/server so we have a single typed interface
 * for all AI generation events across Tech Genie.
 *
 * Usage (in any API route or server component):
 *   import { trackEvent } from '@/lib/analytics/track';
 *   await trackEvent('ai_generation', { tool: 'chat', model: 'gemini', userId });
 *
 * Events tracked:
 *   ai_generation       — any AI tool invocation (chat, image, code, music, video)
 *   ai_generation_error — failed generation with error type
 *   credits_deducted    — credit spend per tool
 *   referral_capture    — creator referral link followed + converted
 *   feature_toggle      — UCOL mode switch (fast/quality/agentic)
 */

import { track } from '@vercel/analytics/server';

// ── Event type definitions ────────────────────────────────────────────────────

export type AITool = 'chat' | 'image' | 'code' | 'music' | 'video' | 'code_builder' | 'guest_chat';
export type UCOLMode = 'fast' | 'quality' | 'agentic' | 'reasoning';

export interface AIGenerationEvent {
  tool: AITool;
  model?: string;
  mode?: UCOLMode;
  userId?: string;
  tokenCount?: number;
  durationMs?: number;
  success: boolean;
}

export interface AIGenerationErrorEvent {
  tool: AITool;
  errorType: 'auth' | 'rate_limit' | 'credits' | 'provider' | 'validation' | 'unknown';
  errorMessage?: string;
  userId?: string;
}

export interface CreditsDeductedEvent {
  tool: AITool;
  credits: number;
  userId: string;
  tier?: string;
}

export interface ReferralCaptureEvent {
  referralCode: string;
  converted: boolean;
  page?: string;
}

export interface FeatureToggleEvent {
  from: UCOLMode;
  to: UCOLMode;
  userId?: string;
}

// ── Tracker functions ─────────────────────────────────────────────────────────

/**
 * Track an AI generation event (success or failure).
 * Non-fatal — never throws, never blocks the response.
 */
export async function trackAIGeneration(event: AIGenerationEvent): Promise<void> {
  try {
    await track('ai_generation', {
      tool: event.tool,
      model: event.model ?? 'unknown',
      mode: event.mode ?? 'quality',
      success: event.success ? '1' : '0',
      ...(event.userId && { userId: event.userId }),
      ...(event.tokenCount !== undefined && { tokenCount: String(event.tokenCount) }),
      ...(event.durationMs !== undefined && { durationMs: String(event.durationMs) }),
    });
  } catch {
    // Analytics should never crash the app
  }
}

/**
 * Track a failed AI generation with error classification.
 */
export async function trackAIError(event: AIGenerationErrorEvent): Promise<void> {
  try {
    await track('ai_generation_error', {
      tool: event.tool,
      errorType: event.errorType,
      ...(event.errorMessage && { errorMessage: event.errorMessage.substring(0, 200) }),
      ...(event.userId && { userId: event.userId }),
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Track credit spend per tool invocation.
 */
export async function trackCreditsDeducted(event: CreditsDeductedEvent): Promise<void> {
  try {
    await track('credits_deducted', {
      tool: event.tool,
      credits: String(event.credits),
      userId: event.userId,
      ...(event.tier && { tier: event.tier }),
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Track creator referral link capture and conversion.
 */
export async function trackReferral(event: ReferralCaptureEvent): Promise<void> {
  try {
    await track('referral_capture', {
      referralCode: event.referralCode,
      converted: event.converted ? '1' : '0',
      ...(event.page && { page: event.page }),
    });
  } catch {
    // Non-fatal
  }
}

/**
 * Track UCOL mode toggle (fast/quality/agentic).
 */
export async function trackFeatureToggle(event: FeatureToggleEvent): Promise<void> {
  try {
    await track('feature_toggle', {
      from: event.from,
      to: event.to,
      ...(event.userId && { userId: event.userId }),
    });
  } catch {
    // Non-fatal
  }
}
