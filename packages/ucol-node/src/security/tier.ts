/**
 * @file security/tier.ts
 * @description SecurityTier hard enforcement per UCOL spec §7.1.
 *
 * Security tiers are immutable once assigned.
 * Violations are logged and rejected — never silently passed.
 */

import type { SecurityTier, KnowledgeItem, Artifact, HistoryItem } from '../store/schema.js';
import { SECURITY_TIER_ORDER } from '../store/schema.js';

/** Model tier descriptor — defines what a model can receive */
export interface ModelTierDescriptor {
  modelId: string;
  /** Maximum tier this model may receive (default: CONFIDENTIAL for cloud models) */
  maxTier: SecurityTier;
  isLocal: boolean;
}

/**
 * Default model tier assignments per spec §7.1:
 * Cloud API models: max_tier = CONFIDENTIAL
 * Local/on-prem models: max_tier = RESTRICTED
 */
export function getDefaultModelMaxTier(modelId: string): SecurityTier {
  if (modelId.startsWith('local/')) return 'RESTRICTED';
  // All cloud providers: anthropic/, google/, deepseek/, openai/, etc.
  return 'CONFIDENTIAL';
}

/**
 * Enforce that a model may receive a context item of the given tier.
 * This is a HARD CONSTRAINT — never overridden by logic.
 *
 * @param modelId - Target model identifier
 * @param itemTier - Security tier of the context item
 * @param modelMaxTier - Max tier this model is allowed to receive
 * @throws Error if the tier exceeds the model's max allowed tier
 */
export function enforceModelTier(
  modelId: string,
  itemTier: SecurityTier,
  modelMaxTier?: SecurityTier
): void {
  const maxTier = modelMaxTier ?? getDefaultModelMaxTier(modelId);
  if (SECURITY_TIER_ORDER[itemTier] > SECURITY_TIER_ORDER[maxTier]) {
    throw new Error(
      `TIER_VIOLATION: Model '${modelId}' has maxTier='${maxTier}' but ` +
        `received item with tier='${itemTier}'. This is a hard security constraint.`
    );
  }
}

/**
 * Filter a list of context items to those accessible at a given clearance.
 *
 * @param items - Array of context items with security_tier
 * @param clearance - Agent's security clearance
 * @returns Filtered items visible at the given clearance
 */
export function filterByClearance<T extends { security_tier: SecurityTier }>(
  items: T[],
  clearance: SecurityTier
): T[] {
  return items.filter(
    (item) => SECURITY_TIER_ORDER[item.security_tier] <= SECURITY_TIER_ORDER[clearance]
  );
}

/**
 * Check if a given clearance level allows access to an item tier.
 *
 * @param clearance - Agent's security clearance
 * @param itemTier - Security tier of the item
 * @returns true if access is permitted
 */
export function canAccess(clearance: SecurityTier, itemTier: SecurityTier): boolean {
  return SECURITY_TIER_ORDER[clearance] >= SECURITY_TIER_ORDER[itemTier];
}

/**
 * Validate that upgrading an item's tier is permitted.
 * Tiers may only be upgraded (never downgraded) by agents with ADMIN capability.
 *
 * @param currentTier - Current tier of the item
 * @param newTier - Proposed new tier
 * @throws Error if downgrade is attempted
 */
export function validateTierUpgrade(currentTier: SecurityTier, newTier: SecurityTier): void {
  if (SECURITY_TIER_ORDER[newTier] < SECURITY_TIER_ORDER[currentTier]) {
    throw new Error(
      `TIER_DOWNGRADE_FORBIDDEN: Cannot downgrade item from '${currentTier}' to '${newTier}'. ` +
        `Context item tiers are immutable and may only be upgraded.`
    );
  }
}

/**
 * Compute the highest tier present in a context fragment.
 * Used to set Metadata.security_tier = max(all item tiers).
 *
 * @param knowledge - Knowledge items
 * @param artifacts - Artifact items
 * @param history - History items (always PUBLIC by default)
 * @returns Highest SecurityTier present
 */
export function computeContextTier(
  knowledge: KnowledgeItem[],
  artifacts: Artifact[],
  history: HistoryItem[]
): SecurityTier {
  let maxOrder = 0;
  let maxTier: SecurityTier = 'PUBLIC';

  for (const k of knowledge) {
    const order = SECURITY_TIER_ORDER[k.security_tier];
    if (order > maxOrder) {
      maxOrder = order;
      maxTier = k.security_tier;
    }
  }
  for (const a of artifacts) {
    const order = SECURITY_TIER_ORDER[a.security_tier];
    if (order > maxOrder) {
      maxOrder = order;
      maxTier = a.security_tier;
    }
  }

  return maxTier;
}

/**
 * Audit log entry for tier violations.
 */
export interface TierViolationEvent {
  event: 'ucol.tier_violation';
  model_id: string;
  item_tier: SecurityTier;
  model_max_tier: SecurityTier;
  timestamp: string;
  agent_id?: string;
  session_id?: string;
}

/**
 * Create a tier violation audit event.
 *
 * @param modelId - Model that violated the constraint
 * @param itemTier - Tier of the rejected item
 * @param modelMaxTier - Model's allowed max tier
 * @param context - Optional audit context
 * @returns TierViolationEvent for logging
 */
export function createViolationEvent(
  modelId: string,
  itemTier: SecurityTier,
  modelMaxTier: SecurityTier,
  context?: { agentId?: string; sessionId?: string }
): TierViolationEvent {
  return {
    event: 'ucol.tier_violation',
    model_id: modelId,
    item_tier: itemTier,
    model_max_tier: modelMaxTier,
    timestamp: new Date().toISOString(),
    agent_id: context?.agentId,
    session_id: context?.sessionId,
  };
}
