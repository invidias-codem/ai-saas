// lib/referral/index.ts
// Tech Genie Referral Tracking Utilities


import { supabaseAdmin } from '@/lib/supabaseClient';

export const REFERRAL_COOKIE = 'tg_ref';
export const PLATFORM_COOKIE = 'tg_ref_platform';
export const COOKIE_MAX_AGE  = 60 * 60 * 24 * 30; // 30 days

/**
 * Parse referral params from a URL search string.
 * Supports ?ref=handle and standard UTM params.
 */
export function parseReferralParams(searchParams: URLSearchParams) {
  const ref      = searchParams.get('ref')?.toLowerCase().trim() || null;
  const platform = searchParams.get('utm_source')?.toLowerCase() || 'direct';
  const campaign = searchParams.get('utm_campaign') || null;
  return { ref, platform, campaign };
}

/**
 * Hash an IP address for privacy-safe deduplication.
 */
export async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.REFERRAL_IP_SALT || 'tg_salt'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Log a referral event to Supabase.
 * Safe to call from API routes (server-side only).
 */
export async function logReferralEvent({
  code,
  eventType,
  userId,
  ipHash,
  platform,
  utmSource,
  utmCampaign,
  amountUsd,
  metadata,
}: {
  code: string;
  eventType: 'visit' | 'signup' | 'upgrade';
  userId?: string;
  ipHash?: string;
  platform?: string;
  utmSource?: string;
  utmCampaign?: string;
  amountUsd?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!supabaseAdmin) {
    console.error('[Referral] supabaseAdmin not available');
    return null;
  }

  // Verify the code exists and is active
  const { data: code_row } = await supabaseAdmin
    .from('referral_codes')
    .select('code')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (!code_row) {
    console.warn(`[Referral] Unknown or inactive code: ${code}`);
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('referral_events')
    .insert({
      code,
      event_type:   eventType,
      user_id:      userId   || null,
      ip_hash:      ipHash   || null,
      platform:     platform || 'direct',
      utm_source:   utmSource  || null,
      utm_campaign: utmCampaign || null,
      amount_usd:   amountUsd || null,
      metadata:     metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('[Referral] Insert error:', error);
    return null;
  }

  return data;
}

/**
 * Attach a referral code to a user's profile in supporter_credits.
 * Only sets once — first-touch wins.
 */
export async function captureReferralForUser(userId: string, code: string): Promise<boolean> {
  if (!supabaseAdmin) return false;

  // Check user doesn't already have a referral code
  const { data: user } = await supabaseAdmin
    .from('supporter_credits')
    .select('referral_code')
    .eq('user_id', userId)
    .single();

  if (user?.referral_code) {
    console.log(`[Referral] User ${userId} already attributed to ${user.referral_code}`);
    return false;
  }

  const { error } = await supabaseAdmin
    .from('supporter_credits')
    .update({
      referral_code:        code,
      referral_captured_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[Referral] Failed to capture referral for user:', error);
    return false;
  }

  return true;
}

/**
 * Look up which referral code is attributed to a user (by Clerk ID).
 */
export async function getReferralCodeForUser(userId: string): Promise<string | null> {
  if (!supabaseAdmin) return null;

  const { data } = await supabaseAdmin
    .from('supporter_credits')
    .select('referral_code')
    .eq('user_id', userId)
    .single();

  return data?.referral_code || null;
}

/**
 * Look up which referral code is attributed to a user by email
 * (used by Ko-fi webhook which only has email).
 */
export async function getReferralCodeForEmail(email: string): Promise<{ userId: string; code: string } | null> {
  if (!supabaseAdmin) return null;

  const { data } = await supabaseAdmin
    .from('supporter_credits')
    .select('user_id, referral_code')
    .eq('email', email)
    .not('referral_code', 'is', null)
    .single();

  if (!data?.referral_code) return null;
  return { userId: data.user_id, code: data.referral_code };
}
