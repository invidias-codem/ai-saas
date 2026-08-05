import { supabaseAdmin } from "@/lib/supabaseClient";

export const CREDIT_COSTS = {
    CHAT_MESSAGE: 1,
    IMAGE_GENERATION: 10,
    VIDEO_GENERATION: 50,
    CODE_GENERATION: 2,
    MUSIC_GENERATION: 10,
    PREVIEW_RENDER: 1,
};

export type CreditOperation = keyof typeof CREDIT_COSTS;

/**
 * Checks if a user has enough credits for an operation.
 */
export async function checkCredits(userId: string, cost: number): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const { data, error } = await supabaseAdmin
        .from('supporter_credits')
        .select('credit_balance')
        .eq('user_id', userId)
        .single();

    if (error || !data) {
        // Fallback: If no record, assume 0 credits (or 10 if we auto-create, but check first)
        // For safety, return false if we can't verify.
        return false;
    }

    return (data.credit_balance || 0) >= cost;
}

/**
 * Deducts credits from a user. Returns true if successful.
 * Uses atomic DB function `increment_credits` (negative increment).
 */
export async function deductCredits(userId: string, cost: number, description: string): Promise<boolean> {
    if (!supabaseAdmin) return false;

    // Optional: Double check balance before verify (handled by checkCredits usually, but for atomic safety...)
    // The RPC sets balance = balance + amount. 
    // We should probably ensure balance doesn't go negative in the database constraint or in the RPC.
    // Our RPC doesn't currently prevent negative.
    // Ideally, we'd upgrade `increment_credits` to fail if negative result, but for now we rely on app logic.

    const { error } = await supabaseAdmin.rpc('increment_credits', {
        p_user_id: userId,
        p_amount: -cost,
        p_type: 'USAGE',
        p_description: description,
        p_metadata: {}
    });

    if (error) {
        console.error(`[Credits] Failed to deduct ${cost} from ${userId}:`, error);
        return false;
    }

    return true;
}


export async function hasUnlimitedUsageAccess(userId?: string | null): Promise<boolean> {
    if (!userId) return false;

    const allowlist = (process.env.UNLIMITED_USAGE_USER_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

    if (allowlist.includes(userId)) {
        return true;
    }

    if (!supabaseAdmin) {
        return false;
    }

    try {
        const { data, error } = await supabaseAdmin
            .from('supporter_credits')
            .select('tier')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error(`[Credits] Failed to resolve tier for unlimited access ${userId}:`, error);
            return false;
        }

        return data?.tier === 'enterprise';
    } catch (error) {
        console.error(`[Credits] Exception resolving unlimited access for ${userId}:`, error);
        return false;
    }
}

export interface SpendResult {
    success: boolean;
    duplicate: boolean;
    remaining: number;
    error?: string;
}

/**
 * Atomically checks and deducted credits using the `spend_credits` RPC.
 * Supports idempotency to prevent double-charging.
 */
export async function spendCreditsAtomic(
    userId: string,
    amount: number,
    idempotencyKey: string | null,
    description: string = 'Usage',
    metadata: any = {}
): Promise<SpendResult> {
    if (!supabaseAdmin) {
        console.error("[Credits] Supabase admin client not initialized");
        return { success: false, duplicate: false, remaining: 0, error: "Internal Configuration Error" };
    }

    const { data, error } = await supabaseAdmin.rpc('spend_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
        p_description: description,
        p_metadata: metadata
    });

    if (error) {
        console.error(`[Credits] Atomic spend failed for ${userId}:`, error);
        return { success: false, duplicate: false, remaining: 0, error: error.message };
    }

    return data as SpendResult;
}

/**
 * Refunds credits to a user.
 */
export async function refundCredits(userId: string, amount: number, description: string = 'Refund', metadata: any = {}): Promise<boolean> {
    if (!supabaseAdmin) return false;

    const { error } = await supabaseAdmin.rpc('increment_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_type: 'REFUND',
        p_description: description,
        p_metadata: metadata
    });

    if (error) {
        console.error(`[Credits] Refund failed for ${userId}:`, error);
        return false;
    }

    return true;
}

/**
 * Gets the current credit balance for a user.
 */
export async function getCredits(userId: string): Promise<number> {
    if (!supabaseAdmin) return 0;

    const { data, error } = await supabaseAdmin
        .from('supporter_credits')
        .select('credit_balance')
        .eq('user_id', userId)
        .single();

    if (error || !data) return 0;
    return data.credit_balance;
}
