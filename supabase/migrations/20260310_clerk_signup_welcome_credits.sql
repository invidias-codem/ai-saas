-- Migration: 20260310_clerk_signup_welcome_credits
-- Supports the Clerk webhook that provisions free credits on user.created.
--
-- Changes:
--   1. Ensure supporter_credits has the columns we need (email, tier)
--   2. Expand tier CHECK to include 'deleted'
--   3. Unique constraint on user_id (enables upsert with onConflict)
--   4. grant_welcome_credits() helper function (idempotent, for backfilling)

-- ── 1. Ensure email column exists ───────────────────────────────────────────
ALTER TABLE supporter_credits
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ── 2. Expand tier CHECK constraint to include 'deleted' ────────────────────
ALTER TABLE supporter_credits
  DROP CONSTRAINT IF EXISTS supporter_credits_tier_check;

ALTER TABLE supporter_credits
  ADD CONSTRAINT supporter_credits_tier_check
  CHECK (tier IN ('free', 'pro', 'enterprise', 'deleted'));

-- ── 3. Unique constraint on user_id (allows upsert ignoreDuplicates) ────────
ALTER TABLE supporter_credits
  DROP CONSTRAINT IF EXISTS supporter_credits_user_id_key;

ALTER TABLE supporter_credits
  ADD CONSTRAINT supporter_credits_user_id_key UNIQUE (user_id);

-- ── 4. grant_welcome_credits() — idempotent backfill helper ─────────────────
-- Call this manually to backfill existing users who signed up before this
-- webhook existed and have 0 credits.
--
-- Usage: SELECT grant_welcome_credits(25);
CREATE OR REPLACE FUNCTION grant_welcome_credits(p_amount INT DEFAULT 25)
RETURNS TABLE (user_id TEXT, credited BOOLEAN) AS $$
BEGIN
  RETURN QUERY
    UPDATE supporter_credits
    SET    credit_balance = p_amount,
           tier           = 'free'
    WHERE  credit_balance = 0
      AND  tier           != 'deleted'
    RETURNING supporter_credits.user_id, TRUE AS credited;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
