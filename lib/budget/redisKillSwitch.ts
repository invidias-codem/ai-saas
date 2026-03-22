/**
 * Redis Kill Switch — Distributed LLM Budget Enforcement
 *
 * Uses Upstash Redis (already in package.json) with INCRBYFLOAT for atomic
 * cross-instance spend tracking. If Redis is unavailable, the request is
 * allowed through (non-fatal degradation).
 *
 * ─── Required Environment Variables ──────────────────────────────────────────
 * UPSTASH_REDIS_REST_URL          Upstash REST endpoint (e.g. https://xxx.upstash.io)
 * UPSTASH_REDIS_REST_TOKEN        Upstash REST token
 *
 * ─── Optional Tuning Variables ───────────────────────────────────────────────
 * LLM_BUDGET_PER_USER_USD         Per-user spend cap in USD   (default: 5.00)
 * LLM_BUDGET_GLOBAL_USD           Global spend cap in USD     (default: 500.00)
 * ENABLE_LLM_BUDGET_ENFORCEMENT   Feature flag; "true" to enforce (default: false)
 *
 * ─── Key Schema ──────────────────────────────────────────────────────────────
 * llm_spend:{userId}   → cumulative USD spend for a single user
 * llm_spend:global     → cumulative USD spend across all users / instances
 */

import { Redis } from "@upstash/redis";

// ─── Model Pricing (USD per 1 000 tokens) ────────────────────────────────────
// Prices as of Q1 2025. Update when provider pricing changes.
const MODEL_PRICING: Record<
  string,
  { inputPer1k: number; outputPer1k: number }
> = {
  // Gemini Flash family

  "gemini-3.1-flash-lite-preview":       { inputPer1k: 0.000038, outputPer1k: 0.000150 },
  "gemini-1.5-flash":            { inputPer1k: 0.000075, outputPer1k: 0.000300 },
  // Gemini Pro family
  "gemini-1.5-pro":              { inputPer1k: 0.001250, outputPer1k: 0.005000 },
  "gemini-1.5-pro-preview-0409": { inputPer1k: 0.001250, outputPer1k: 0.005000 },
  "gemini-3-flash-preview":      { inputPer1k: 0.000075, outputPer1k: 0.000300 }, // placeholder
  // Claude Sonnet family
  "claude-sonnet-4-5-20250929":  { inputPer1k: 0.003000, outputPer1k: 0.015000 },
  "claude-sonnet-4-6":           { inputPer1k: 0.003000, outputPer1k: 0.015000 },
  "claude-3-5-sonnet-20241022":  { inputPer1k: 0.003000, outputPer1k: 0.015000 },
  "claude-3-haiku-20240307":     { inputPer1k: 0.000250, outputPer1k: 0.001250 },
  // DeepSeek
  "deepseek-r1":                 { inputPer1k: 0.000550, outputPer1k: 0.002190 },
  "deepseek-chat":               { inputPer1k: 0.000140, outputPer1k: 0.000280 },
  // Hermes / local models (approximate, adjust as needed)
  "hermes-3-llama-3.1-8b":       { inputPer1k: 0.000100, outputPer1k: 0.000100 },
  "hermes-3-llama-3.2-3b":       { inputPer1k: 0.000050, outputPer1k: 0.000050 },
};

// Fallback for unknown models — conservative estimate
const DEFAULT_PRICING = { inputPer1k: 0.001000, outputPer1k: 0.003000 };

// ─── Config ───────────────────────────────────────────────────────────────────
const PER_USER_LIMIT_USD = parseFloat(
  process.env.LLM_BUDGET_PER_USER_USD ?? "5.00"
);
const GLOBAL_LIMIT_USD = parseFloat(
  process.env.LLM_BUDGET_GLOBAL_USD ?? "500.00"
);
const ENFORCEMENT_ENABLED =
  process.env.ENABLE_LLM_BUDGET_ENFORCEMENT === "true";

// Key TTL: 30 days (rolling reset on key creation; resetSpend() clears manually)
const KEY_TTL_SECONDS = 30 * 24 * 60 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface BudgetCheckResult {
  allowed: boolean;
  /** USD spent so far for this user */
  userSpendUSD: number;
  /** USD spent globally across all users/instances */
  globalSpendUSD: number;
  /** Why the request was blocked (only set when allowed=false) */
  reason?: "user_budget_exceeded" | "global_budget_exceeded";
}

export interface SpendRecord {
  inputTokens: number;
  outputTokens: number;
  model: string;
  /** Calculated cost in USD */
  costUSD: number;
}

// ─── Redis singleton ──────────────────────────────────────────────────────────
let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Silently skip — Redis not configured (common in local dev)
    return null;
  }

  try {
    _redis = new Redis({ url, token });
    return _redis;
  } catch (err) {
    console.warn("[BudgetKillSwitch] Failed to create Redis client:", err);
    return null;
  }
}

// ─── Key helpers ──────────────────────────────────────────────────────────────
const userKey = (userId: string) => `llm_spend:${userId}`;
const GLOBAL_KEY = "llm_spend:global";

// ─── Cost calculator ─────────────────────────────────────────────────────────
function calculateCostUSD(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  // Normalize model id to lowercase for matching
  const normalizedModel = model.toLowerCase();

  // Try exact match first, then prefix match
  let pricing =
    MODEL_PRICING[model] ??
    MODEL_PRICING[normalizedModel] ??
    Object.entries(MODEL_PRICING).find(([k]) =>
      normalizedModel.startsWith(k.toLowerCase())
    )?.[1] ??
    DEFAULT_PRICING;

  const cost =
    (inputTokens / 1000) * pricing.inputPer1k +
    (outputTokens / 1000) * pricing.outputPer1k;

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
}

// ─── Main class ───────────────────────────────────────────────────────────────
export class RedisKillSwitch {
  /**
   * Check whether a user is within budget BEFORE making an LLM call.
   * Returns allowed=true and does NOT block when:
   *   - Enforcement is disabled (ENABLE_LLM_BUDGET_ENFORCEMENT != "true")
   *   - Redis is unavailable (non-fatal degradation)
   */
  async checkBudget(userId: string): Promise<BudgetCheckResult> {
    // Feature-flag short-circuit
    if (!ENFORCEMENT_ENABLED) {
      return { allowed: true, userSpendUSD: 0, globalSpendUSD: 0 };
    }

    const redis = getRedis();
    if (!redis) {
      console.warn(
        "[BudgetKillSwitch] Redis unavailable — allowing request through"
      );
      return { allowed: true, userSpendUSD: 0, globalSpendUSD: 0 };
    }

    try {
      // Fetch both values in one round-trip
      const [userRaw, globalRaw] = await Promise.all([
        redis.get<string>(userKey(userId)),
        redis.get<string>(GLOBAL_KEY),
      ]);

      const userSpendUSD = parseFloat(userRaw ?? "0") || 0;
      const globalSpendUSD = parseFloat(globalRaw ?? "0") || 0;

      if (userSpendUSD >= PER_USER_LIMIT_USD) {
        console.warn(
          `[BudgetKillSwitch] User ${userId} over budget: $${userSpendUSD.toFixed(4)} >= $${PER_USER_LIMIT_USD}`
        );
        return {
          allowed: false,
          userSpendUSD,
          globalSpendUSD,
          reason: "user_budget_exceeded",
        };
      }

      if (globalSpendUSD >= GLOBAL_LIMIT_USD) {
        console.warn(
          `[BudgetKillSwitch] Global budget exceeded: $${globalSpendUSD.toFixed(4)} >= $${GLOBAL_LIMIT_USD}`
        );
        return {
          allowed: false,
          userSpendUSD,
          globalSpendUSD,
          reason: "global_budget_exceeded",
        };
      }

      return { allowed: true, userSpendUSD, globalSpendUSD };
    } catch (err) {
      // Non-fatal — Redis error should never block a user request
      console.warn(
        "[BudgetKillSwitch] checkBudget failed (allowing through):",
        err
      );
      return { allowed: true, userSpendUSD: 0, globalSpendUSD: 0 };
    }
  }

  /**
   * Atomically record spend after a successful LLM response.
   * Uses INCRBYFLOAT for atomic cross-instance accumulation.
   * Silently no-ops when Redis is unavailable.
   */
  async recordSpend(
    userId: string,
    inputTokens: number,
    outputTokens: number,
    model: string
  ): Promise<SpendRecord> {
    const costUSD = calculateCostUSD(inputTokens, outputTokens, model);
    const record: SpendRecord = { inputTokens, outputTokens, model, costUSD };

    if (costUSD <= 0) return record;

    const redis = getRedis();
    if (!redis) return record;

    try {
      const uk = userKey(userId);

      // INCRBYFLOAT is atomic — safe across multiple Next.js instances / serverless functions
      await Promise.all([
        redis.incrbyfloat(uk, costUSD),
        redis.incrbyfloat(GLOBAL_KEY, costUSD),
      ]);

      // Set TTL only if key is new (don't reset TTL on every request)
      // We do a best-effort EXPIRE — if it fails, no big deal
      const [userExists] = await Promise.all([
        redis.ttl(uk),
      ]).catch(() => [-1]);

      if (typeof userExists === "number" && userExists === -1) {
        // Key has no expiry — set rolling 30-day TTL
        await Promise.allSettled([
          redis.expire(uk, KEY_TTL_SECONDS),
          redis.expire(GLOBAL_KEY, KEY_TTL_SECONDS),
        ]);
      }

      console.log(
        `[BudgetKillSwitch] Recorded $${costUSD.toFixed(6)} for user ${userId}` +
          ` (model=${model}, in=${inputTokens}, out=${outputTokens})`
      );
    } catch (err) {
      // Non-fatal
      console.warn("[BudgetKillSwitch] recordSpend failed (non-blocking):", err);
    }

    return record;
  }

  /**
   * Get the current spend for a user (and globally).
   * Returns zeros when Redis is unavailable.
   */
  async getSpend(
    userId: string
  ): Promise<{ userSpendUSD: number; globalSpendUSD: number }> {
    const redis = getRedis();
    if (!redis) return { userSpendUSD: 0, globalSpendUSD: 0 };

    try {
      const [userRaw, globalRaw] = await Promise.all([
        redis.get<string>(userKey(userId)),
        redis.get<string>(GLOBAL_KEY),
      ]);
      return {
        userSpendUSD: parseFloat(userRaw ?? "0") || 0,
        globalSpendUSD: parseFloat(globalRaw ?? "0") || 0,
      };
    } catch (err) {
      console.warn("[BudgetKillSwitch] getSpend failed:", err);
      return { userSpendUSD: 0, globalSpendUSD: 0 };
    }
  }

  /**
   * Reset spend counters for a user (e.g. on subscription renewal or manual admin override).
   * Does NOT reset the global counter.
   */
  async resetSpend(userId: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      await redis.del(userKey(userId));
      console.log(`[BudgetKillSwitch] Reset spend for user ${userId}`);
    } catch (err) {
      console.warn("[BudgetKillSwitch] resetSpend failed:", err);
    }
  }

  /**
   * Reset the global spend counter (admin use only).
   */
  async resetGlobalSpend(): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
      await redis.del(GLOBAL_KEY);
      console.log("[BudgetKillSwitch] Reset global spend counter");
    } catch (err) {
      console.warn("[BudgetKillSwitch] resetGlobalSpend failed:", err);
    }
  }

  /** Get configured limits (useful for admin dashboards). */
  getLimits() {
    return {
      perUserLimitUSD: PER_USER_LIMIT_USD,
      globalLimitUSD: GLOBAL_LIMIT_USD,
      enforcementEnabled: ENFORCEMENT_ENABLED,
    };
  }
}

// Singleton export — share across module scope in serverless functions
export const budgetKillSwitch = new RedisKillSwitch();
