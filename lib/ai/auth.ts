import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { getUserCredits } from '@/lib/subscription/credits';

export class PremiumRequiredError extends Error {
  constructor(message = "PREMIUM_REQUIRED") {
    super(message);
    this.name = "PremiumRequiredError";
  }
}

/**
 * Encapsulates the Supabase Vault decryption logic and computeCredits fallback.
 * 
 * 1. Tries to fetch the user's custom API key from the Vault.
 * 2. If it doesn't exist, checks their computeCredits.
 * 3. If credits > 0, subsidizes using the root OPENAI_API_KEY.
 * 4. Otherwise, throws a PremiumRequiredError.
 */
export async function getOpenAIClient(userId: string): Promise<OpenAI> {
  // Phase 1: Dynamic Fetch from Vault (to be swapped with Redis cache in Phase 2)
  if (!supabaseAdmin) {
    throw new Error('Supabase Admin not configured');
  }

  const { data: decryptedKey, error } = await supabaseAdmin.rpc('get_user_openai_key', {
    p_user_id: userId
  });

  if (error) {
    console.error('[getOpenAIClient] RPC error fetching key:', error);
  }

  // If user provided a key, use it.
  if (decryptedKey) {
    return new OpenAI({ apiKey: decryptedKey as string });
  }

  // Fallback Policy: Check compute credits
  const credits = await getUserCredits(userId);
  if (credits > 0) {
    // Note: We provide 'dummy-key-for-build' during static generation
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build' });
  }

  // Compute credits are depleted and no BYOK is present
  throw new PremiumRequiredError();
}
