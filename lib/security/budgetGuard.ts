/**
 * budgetGuard.ts — Monthly Token Budget Enforcement
 *
 * Tracks LLM token consumption per user per month and hard-stops requests
 * when the tier budget is exceeded. Uses Supabase atomically (same pattern
 * as spendCreditsAtomic) so concurrent requests can never race past the cap.
 *
 * Inspired by Paperclip AI's agent budget enforcement model.
 *
 * TIERS:
 *   free       →   100,000 tokens/month  (~50 conversations)
 *   pro        → 1,000,000 tokens/month  (~500 conversations)
 *   enterprise → Unlimited (soft-warned at 10M)
 *
 * TOKEN COSTS (approximate, based on provider pricing):
 *   gemini-3.1-flash-lite-preview        →  0.075 / 1M tokens  (cheapest)
 *   deepseek-r1             →  0.55  / 1M tokens
 *   claude-sonnet-*         →  3.00  / 1M tokens  (most expensive)
 *
 * Usage:
 *   const guard = await checkTokenBudget(userId, estimatedTokens, modelId);
 *   if (!guard.allowed) return NextResponse.json({ error: guard.reason }, { status: 402 });
 *   // ... generate response ...
 *   await recordTokenUsage(userId, actualTokensUsed, modelId);
 */

import { supabaseAdmin } from '@/lib/supabaseClient';

// ─── Tier Definitions ────────────────────────────────────────────────────────

export type UserTier = 'free' | 'pro' | 'enterprise';

export const MONTHLY_TOKEN_BUDGETS: Record<UserTier, number> = {
  free:       100_000,      // ~50 typical conversations
  pro:      1_000_000,      // ~500 typical conversations
  enterprise: Infinity,     // Unlimited (soft-warned at 10M)
};

// Soft warning threshold for enterprise (log but don't block)
const ENTERPRISE_SOFT_WARN_THRESHOLD = 10_000_000;

// ─── Model Token Cost Multipliers ────────────────────────────────────────────
// Normalized relative to Gemini Flash = 1.0.
// Used for weighted budget accounting: expensive models consume budget faster.

export const MODEL_COST_WEIGHTS: Record<string, number> = {
  'gemini-3.1-flash-lite-preview':               1.0,
  'gemini-1.5-pro-preview-0409':    4.0,
  'claude-sonnet-4-5-20250929':     8.0,   // Claude Sonnet ~8x Flash cost
  'claude-opus':                   30.0,
  'deepseek-r1':                    2.0,
  'default':                        1.0,
};

function getCostWeight(modelId: string): number {
  // Exact match first
  if (MODEL_COST_WEIGHTS[modelId]) return MODEL_COST_WEIGHTS[modelId];
  // Prefix match
  for (const [key, weight] of Object.entries(MODEL_COST_WEIGHTS)) {
    if (modelId.startsWith(key)) return weight;
  }
  return MODEL_COST_WEIGHTS['default'];
}

// ─── Budget Check Result ──────────────────────────────────────────────────────

export interface BudgetCheckResult {
  allowed: boolean;
  tier: UserTier;
  tokensUsedThisMonth: number;
  tokenBudget: number;
  remaining: number;
  reason?: string;
  warning?: string; // Non-blocking warning (approaching limit)
}

// ─── Tier Resolution ──────────────────────────────────────────────────────────

/**
 * Resolves user tier from supporter_credits table.
 * Falls back to 'free' if no record found.
 * 
 * Extend this function when subscription tiers are added to the DB.
 */
async function getUserTier(userId: string): Promise<UserTier> {
  if (!supabaseAdmin) return 'free';

  try {
    const { data } = await supabaseAdmin
      .from('supporter_credits')
      .select('credit_balance, tier')
      .eq('user_id', userId)
      .single();

    // If a `tier` column exists and is set, use it directly
    if (data?.tier && ['free', 'pro', 'enterprise'].includes(data.tier)) {
      return data.tier as UserTier;
    }

    // Fallback: infer tier from credit balance
    // (Temporary heuristic until subscription system is in place)
    const balance = data?.credit_balance ?? 0;
    if (balance >= 10000) return 'pro';
    if (balance >= 1000) return 'pro';
    return 'free';
  } catch {
    return 'free';
  }
}

// ─── Monthly Usage Tracking ───────────────────────────────────────────────────

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Gets tokens used by a user this calendar month.
 */
async function getMonthlyTokensUsed(userId: string): Promise<number> {
  if (!supabaseAdmin) return 0;

  const monthKey = getCurrentMonthKey();

  try {
    const { data } = await supabaseAdmin
      .from('user_token_budgets')
      .select('tokens_used')
      .eq('user_id', userId)
      .eq('month_key', monthKey)
      .single();

    return data?.tokens_used ?? 0;
  } catch {
    return 0;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks if a user is within their monthly token budget before generation.
 *
 * Call this BEFORE starting LLM generation. If allowed=false, return 402.
 *
 * @param userId - Clerk user ID
 * @param estimatedTokens - Estimated tokens for this request (use estimateTokenCount)
 * @param modelId - Model being used (affects cost weight)
 */
export async function checkTokenBudget(
  userId: string,
  estimatedTokens: number,
  modelId: string = 'gemini-3.1-flash-lite-preview'
): Promise<BudgetCheckResult> {
  const tier = await getUserTier(userId);
  const budget = MONTHLY_TOKEN_BUDGETS[tier];
  const used = await getMonthlyTokensUsed(userId);
  const weight = getCostWeight(modelId);

  // Weighted token cost: Claude Sonnet counts 8x more toward budget than Gemini Flash
  const weightedCost = Math.ceil(estimatedTokens * weight);
  const remaining = budget === Infinity ? Infinity : Math.max(0, budget - used);

  // Enterprise: soft warn, never block
  if (tier === 'enterprise') {
    const warning = used > ENTERPRISE_SOFT_WARN_THRESHOLD
      ? `Enterprise usage high: ${(used / 1_000_000).toFixed(1)}M tokens this month`
      : undefined;
    return { allowed: true, tier, tokensUsedThisMonth: used, tokenBudget: budget, remaining, warning };
  }

  // Hard stop: over budget
  if (used + weightedCost > budget) {
    const resetDate = new Date();
    resetDate.setUTCMonth(resetDate.getUTCMonth() + 1, 1);
    resetDate.setUTCHours(0, 0, 0, 0);

    return {
      allowed: false,
      tier,
      tokensUsedThisMonth: used,
      tokenBudget: budget,
      remaining: 0,
      reason: tier === 'free'
        ? `Monthly token limit reached (${(budget / 1000).toFixed(0)}k tokens). Upgrade to Pro for 10x more capacity.`
        : `Monthly token budget exceeded (${(budget / 1_000_000).toFixed(1)}M tokens). Resets on ${resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
    };
  }

  // Soft warning: approaching limit (>80% used)
  const usagePercent = (used / budget) * 100;
  const warning = usagePercent >= 80
    ? `Approaching monthly token limit: ${usagePercent.toFixed(0)}% used (${(remaining / 1000).toFixed(0)}k remaining)`
    : undefined;

  return { allowed: true, tier, tokensUsedThisMonth: used, tokenBudget: budget, remaining, warning };
}

/**
 * Records actual token usage after generation completes.
 * Fire-and-forget safe — never throws, logs errors only.
 *
 * @param userId - Clerk user ID
 * @param tokensUsed - Actual tokens consumed (input + output)
 * @param modelId - Model used (for cost weight)
 */
export async function recordTokenUsage(
  userId: string,
  tokensUsed: number,
  modelId: string = 'gemini-3.1-flash-lite-preview'
): Promise<void> {
  if (!supabaseAdmin || tokensUsed <= 0) return;

  const monthKey = getCurrentMonthKey();
  const weight = getCostWeight(modelId);
  const weightedTokens = Math.ceil(tokensUsed * weight);

  try {
    // Upsert: create row if new month, otherwise increment atomically
    const { error } = await supabaseAdmin.rpc('increment_token_usage', {
      p_user_id: userId,
      p_month_key: monthKey,
      p_tokens: weightedTokens,
      p_model: modelId,
    });

    if (error) {
      console.error('[BudgetGuard] Failed to record token usage:', error.message);
    }
  } catch (e: any) {
    console.error('[BudgetGuard] Exception recording token usage:', e.message);
  }
}

/**
 * Returns a formatted budget status for the user (for UI display).
 */
export async function getBudgetStatus(userId: string): Promise<{
  tier: UserTier;
  used: number;
  budget: number;
  percentUsed: number;
  resetsAt: string;
}> {
  const tier = await getUserTier(userId);
  const used = await getMonthlyTokensUsed(userId);
  const budget = MONTHLY_TOKEN_BUDGETS[tier];

  const resetDate = new Date();
  resetDate.setUTCMonth(resetDate.getUTCMonth() + 1, 1);
  resetDate.setUTCHours(0, 0, 0, 0);

  return {
    tier,
    used,
    budget: budget === Infinity ? -1 : budget,
    percentUsed: budget === Infinity ? 0 : Math.min(100, (used / budget) * 100),
    resetsAt: resetDate.toISOString(),
  };
}
