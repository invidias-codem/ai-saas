// lib/subscription/credits.ts
//
// UNIFIED LEDGER (2026-07): all credit reads/writes go through the Supabase
// `supporter_credits` table — the same ledger used by image/video/music routes,
// referral logic, and budgetGuard. Clerk privateMetadata.computeCredits is
// DEPRECATED as a balance store (it was a second ledger that payment webhooks
// wrote to while media routes spent from Supabase, causing "paid but locked").
//
// - getUserCredits: reads supporter_credits.credit_balance; lazily provisions
//   a row with INITIAL_CREDITS for legacy users who predate the Clerk webhook.
// - deductUserCredits: atomic spend via the `spend_credits` RPC (no more
//   read-modify-write race on Clerk metadata).

import { supabaseAdmin } from '@/lib/supabaseClient';
import { spendCreditsAtomic, getCredits } from '@/lib/credits';

export const INITIAL_CREDITS = 200;

export async function getUserCredits(userId: string): Promise<number> {
    try {
        if (!supabaseAdmin) {
            console.error('[Credits] Supabase admin client not initialized');
            return 0;
        }

        const { data, error } = await supabaseAdmin
            .from('supporter_credits')
            .select('credit_balance')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('[Credits] Failed to fetch credits for user:', error);
            return 0;
        }

        if (data && typeof data.credit_balance === 'number') {
            return data.credit_balance;
        }

        // Legacy user without a ledger row (predates the Clerk user.created
        // webhook): provision once with the historical default grant.
        const { error: insertError } = await supabaseAdmin
            .from('supporter_credits')
            .insert({
                user_id: userId,
                credit_balance: INITIAL_CREDITS,
                tier: 'free',
            });

        if (insertError) {
            // Row may have been created concurrently — re-read instead of failing.
            if (insertError.code === '23505') {
                return getCredits(userId);
            }
            console.error('[Credits] Failed to provision legacy credits row:', insertError);
            return 0;
        }

        return INITIAL_CREDITS;
    } catch (err) {
        console.error('[Credits] Failed to fetch credits for user:', err);
        return 0;
    }
}

/**
 * Atomically deducts credits from the unified ledger.
 * Signature kept for existing callers (runtimeBridge, chat route):
 * `currentCredits` is now only used as a fallback return value on failure.
 * Returns the remaining balance after the spend.
 */
export async function deductUserCredits(userId: string, currentCredits: number, amount: number): Promise<number> {
    if (amount <= 0) return currentCredits;
    try {
        const result = await spendCreditsAtomic(
            userId,
            amount,
            null,
            'Chat/agent interaction'
        );

        if (!result.success) {
            console.error(`[Credits] Atomic deduct failed for ${userId}:`, result.error);
            return Math.max(0, currentCredits - amount);
        }

        return Math.max(0, result.remaining);
    } catch (err) {
        console.error('[Credits] Failed to deduct credits:', err);
        return Math.max(0, currentCredits - amount);
    }
}

export function calculateInteractionCost(options: {
    hasAttachments: boolean;
    mode: string;
}): number {
    let cost = 1; // Standard text reply
    if (options.hasAttachments) {
        cost += 4; // File ingestion overhead
    }
    if (options.mode === 'agentic' || options.mode === 'reasoning') {
        cost += 4; // Premium agent overhead
    }
    return cost;
}
