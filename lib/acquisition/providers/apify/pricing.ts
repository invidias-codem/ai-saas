// lib/acquisition/providers/apify/pricing.ts
// PURE pricing preflight. Lattice spending authority is computed BEFORE a
// paid run exists; the Actor never gets to override it.
//
// Apify pricing subtleties (contract-locked):
//   - maxTotalChargeUsd bounds PAY_PER_EVENT actors.
//   - maxItems bounds charged items for PRICE_PER_DATASET_ITEM actors, but
//     does NOT guarantee the actor produces only that many records.
//   - Pay-per-event actors may carry minimalMaxTotalChargeUsd; an actor
//     minimum above Lattice's authorized budget ⇒ refuse to launch.

import type { AcquisitionBudget } from '../../contracts';

export type ActorPricingModel = 'FREE' | 'PAY_PER_EVENT' | 'PRICE_PER_DATASET_ITEM';

export interface ActorPricingInfo {
  pricingModel: ActorPricingModel;
  /** Unit price for PRICE_PER_DATASET_ITEM actors. */
  pricePerUnitUsd?: number;
  /** Actor-declared minimum charge for PAY_PER_EVENT actors. */
  minimalMaxTotalChargeUsd?: number;
}

export type PricingDecision =
  | { allowed: true; runOptions: { maxTotalChargeUsd?: number; maxItems: number }; effectiveMaxRecords: number }
  | { allowed: false; reason: 'provider_budget_exceeded' };

export function preflightPricing(args: {
  budget: AcquisitionBudget;
  pricing: ActorPricingInfo;
}): PricingDecision {
  const { budget, pricing } = args;

  if (budget.maxActors <= 0) {
    return { allowed: false, reason: 'provider_budget_exceeded' };
  }

  switch (pricing.pricingModel) {
    case 'FREE': {
      // Still carry maxItems — the budget record travels with the run and
      // bounds collect().
      return {
        allowed: true,
        runOptions: { maxItems: budget.maxRecords },
        effectiveMaxRecords: budget.maxRecords,
      };
    }
    case 'PAY_PER_EVENT': {
      const actorMin = pricing.minimalMaxTotalChargeUsd ?? 0;
      if (actorMin > budget.maxProviderCostUsd) {
        // Actor minimum exceeds Lattice authority → no run.
        return { allowed: false, reason: 'provider_budget_exceeded' };
      }
      return {
        allowed: true,
        runOptions: { maxTotalChargeUsd: budget.maxProviderCostUsd, maxItems: budget.maxRecords },
        effectiveMaxRecords: budget.maxRecords,
      };
    }
    case 'PRICE_PER_DATASET_ITEM': {
      const unit = pricing.pricePerUnitUsd;
      if (unit === undefined || unit === null || unit <= 0) {
        // Cannot safely bound a per-item actor without its unit price.
        return { allowed: false, reason: 'provider_budget_exceeded' };
      }
      const affordable = Math.floor(budget.maxProviderCostUsd / unit);
      const effective = Math.min(budget.maxRecords, affordable);
      if (effective < 1) {
        return { allowed: false, reason: 'provider_budget_exceeded' };
      }
      return {
        allowed: true,
        runOptions: { maxItems: effective },
        effectiveMaxRecords: effective,
      };
    }
    default:
      return { allowed: false, reason: 'provider_budget_exceeded' };
  }
}
