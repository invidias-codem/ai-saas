// lib/subscription/packs.ts
//
// SINGLE SOURCE OF TRUTH for the credit economy.
// Both the display layer (pricing copy, support modal) and the payment
// webhooks read from here so the buyer always sees the exact amount they
// receive. Change a number in one place → everywhere stays coherent.
//
// Conversion: 1 USD = CREDITS_PER_DOLLAR compute credits.
// Webhooks grant Math.floor(amount * CREDITS_PER_DOLLAR); the PACKS below are
// the curated price points we advertise and link to as fixed Ko-fi products.

export const CREDITS_PER_DOLLAR = 50;

/** Credits every new account receives on signup (free trial). */
export const WELCOME_CREDITS = 200;

export interface CreditPack {
  /** Stable id used in links / analytics. */
  id: string;
  /** Display name shown to buyers. */
  name: string;
  /** Price in USD. */
  priceUsd: number;
  /** Credits granted (priceUsd * CREDITS_PER_DOLLAR). */
  credits: number;
  /** Short selling-point shown under the button. */
  blurb: string;
  /** Ko-fi product slug (the part after ko-fi.com/<page>/<slug>). Optional. */
  kofiSlug?: string;
}

export const PACKS: CreditPack[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    priceUsd: 5,
    credits: 5 * CREDITS_PER_DOLLAR, // 250
    blurb: '250 credits — ~250 chats or 5 images',
    kofiSlug: 'S6S41XW1LK',
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    priceUsd: 20,
    credits: 20 * CREDITS_PER_DOLLAR, // 1000
    blurb: '1,000 credits — heavy media workloads',
    kofiSlug: 'R5R2YZV2MZ',
  },
  {
    id: 'scale',
    name: 'Scale Pack',
    priceUsd: 50,
    credits: 50 * CREDITS_PER_DOLLAR, // 2500
    blurb: '2,500 credits — teams & power users',
    kofiSlug: 'T7T3ZWX3NZ',
  },
];

/**
 * Resolve a purchased amount to the closest advertised pack (for webhook
 * audit labels). Returns null when the amount doesn't match a pack — the
 * webhook still grants floor(amount*RATE) credits either way.
 */
export function matchPack(amountUsd: number): CreditPack | null {
  const rounded = Math.round(amountUsd * 100) / 100;
  return PACKS.find((p) => p.priceUsd === rounded) ?? null;
}

/**
 * Build a Ko-fi checkout URL for a pack.
 *
 * Ko-fi shop products are hosted under `/shop/<page>/<slug>`. If a pack has
 * no `kofiSlug`, we fall back to the base page so the widget/donation flow
 * is still reachable.
 */
export function kofiPackUrl(pack: CreditPack, basePage: string): string {
  const page = basePage.replace(/\/+$/, '');
  if (pack.kofiSlug) {
    return `https://ko-fi.com/shop/${page.replace(/^https?:\/\/(www\.)?ko-fi\.com\//, '')}/${pack.kofiSlug}`;
  }
  return page;
}
