-- Migration: 20260223_referral_system.sql
-- Tech Genie Creator Referral Tracking

-- 1. Creator referral codes registry
CREATE TABLE IF NOT EXISTS referral_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,
  creator_handle   text NOT NULL,
  creator_name     text,
  email            text NOT NULL,
  paypal_email     text,
  track            text NOT NULL DEFAULT 'creator' CHECK (track IN ('creator', 'affiliate')),
  bonus_multiplier numeric NOT NULL DEFAULT 1.0,
  is_active        boolean NOT NULL DEFAULT true,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 2. All referral events (visits, signups, upgrades)
CREATE TABLE IF NOT EXISTS referral_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL REFERENCES referral_codes(code) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('visit', 'signup', 'upgrade')),
  user_id      text,        -- Clerk user ID (null for anonymous visits)
  ip_hash      text,        -- SHA-256 of IP (dedup + privacy)
  platform     text,        -- tiktok | instagram | threads | x | direct
  utm_source   text,
  utm_campaign text,
  amount_usd   numeric,     -- populated for 'upgrade' events (Ko-fi amount)
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3. Add referral tracking to user profiles
ALTER TABLE supporter_credits
  ADD COLUMN IF NOT EXISTS referral_code         text,
  ADD COLUMN IF NOT EXISTS referral_captured_at  timestamptz;

-- 4. Payout records (filled by admin monthly)
CREATE TABLE IF NOT EXISTS referral_payouts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL REFERENCES referral_codes(code),
  period_start          date NOT NULL,
  period_end            date NOT NULL,
  signup_count          int NOT NULL DEFAULT 0,
  upgrade_count         int NOT NULL DEFAULT 0,
  view_payout_usd       numeric NOT NULL DEFAULT 0,  -- manually entered from video views
  signup_payout_usd     numeric GENERATED ALWAYS AS (signup_count * 5.0) STORED,
  conversion_payout_usd numeric GENERATED ALWAYS AS (upgrade_count * 15.0) STORED,
  bonus_multiplier      numeric NOT NULL DEFAULT 1.0,
  total_usd             numeric GENERATED ALWAYS AS (
                          (view_payout_usd + (signup_count * 5.0) + (upgrade_count * 15.0)) * bonus_multiplier
                        ) STORED,
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  paid_at               timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_referral_events_code       ON referral_events(code);
CREATE INDEX IF NOT EXISTS idx_referral_events_user_id    ON referral_events(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_type       ON referral_events(event_type);
CREATE INDEX IF NOT EXISTS idx_referral_events_created    ON referral_events(created_at);
CREATE INDEX IF NOT EXISTS idx_supporter_credits_ref_code ON supporter_credits(referral_code);

-- 6. RLS Policies (referral_codes and referral_events are admin-only)
ALTER TABLE referral_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_payouts ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (no public access)
-- Admin queries use supabaseAdmin client (service role key) which bypasses RLS

-- 7. Helpful views
CREATE OR REPLACE VIEW referral_summary AS
SELECT
  rc.code,
  rc.creator_handle,
  rc.track,
  rc.bonus_multiplier,
  COUNT(CASE WHEN re.event_type = 'visit'   THEN 1 END) AS total_visits,
  COUNT(CASE WHEN re.event_type = 'signup'  THEN 1 END) AS total_signups,
  COUNT(CASE WHEN re.event_type = 'upgrade' THEN 1 END) AS total_upgrades,
  SUM(CASE WHEN re.event_type = 'upgrade'   THEN re.amount_usd ELSE 0 END) AS total_revenue_usd,
  MIN(re.created_at) AS first_event_at,
  MAX(re.created_at) AS last_event_at
FROM referral_codes rc
LEFT JOIN referral_events re ON re.code = rc.code
WHERE rc.is_active = true
GROUP BY rc.code, rc.creator_handle, rc.track, rc.bonus_multiplier;
