-- Refactor Credits System to reuse primitives and enforce composite idempotency

-- 1. Modify credit_transactions to use composite unique index
DO $$
BEGIN
    -- Drop global unique constraint if it was created by migration_atomic_credits.sql
    -- Note: constraint name is usually table_column_key for UNIQUE column constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_idempotency_key_key') THEN
        ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_idempotency_key_key;
    END IF;
END $$;

-- Create composite unique index (scoped to user)
-- This allows different users to use the same key (e.g. "onboarding-bonus") conceptually, 
-- though UUIDs are preferred.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_user_idempotency 
ON public.credit_transactions(user_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- 2. Update increment_credits to accept idempotency_key
-- We drop and recreate to change signature safely
DROP FUNCTION IF EXISTS increment_credits(text, integer, credit_transaction_type, text, jsonb);

CREATE OR REPLACE FUNCTION increment_credits(
    p_user_id TEXT, 
    p_amount INTEGER, 
    p_type credit_transaction_type DEFAULT 'PURCHASE', 
    p_description TEXT DEFAULT 'Credits added',
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Upsert credits (initialize if missing)
  INSERT INTO public.supporter_credits (user_id, credit_balance, is_supporter, updated_at)
  VALUES (p_user_id, p_amount + 10, true, NOW()) -- +10 is base if new (legacy logic preserved)
  ON CONFLICT (user_id)
  DO UPDATE SET 
    credit_balance = public.supporter_credits.credit_balance + p_amount,
    is_supporter = true,
    updated_at = NOW();

  -- Log transaction with idempotency key
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, description, metadata, idempotency_key)
  VALUES (p_user_id, p_amount, p_type, p_description, p_metadata, p_idempotency_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Secure increment_credits: Only allow service_role (or internal SUPERUSER calls via SECURITY DEFINER functions)
REVOKE ALL ON FUNCTION increment_credits(text, integer, credit_transaction_type, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_credits(text, integer, credit_transaction_type, text, jsonb, text) TO service_role;


-- 3. Update spend_credits to use increment_credits
-- This ensures a single source of truth for balance updates and logging
CREATE OR REPLACE FUNCTION spend_credits(
    p_user_id TEXT,
    p_amount INTEGER,
    p_idempotency_key TEXT,
    p_description TEXT DEFAULT 'Usage',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance INTEGER;
BEGIN
    -- 0. Authorization Check
    IF (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role') THEN
        -- Allow service role
    ELSIF (auth.uid()::text != p_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unauthorized',
            'remaining', 0
        );
    END IF;

    -- 1. Check for Idempotency (Duplicate Request)
    IF p_idempotency_key IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.credit_transactions 
            WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        ) THEN
            -- Get current balance for response
            SELECT credit_balance INTO v_current_balance 
            FROM public.supporter_credits 
            WHERE user_id = p_user_id;

            RETURN jsonb_build_object(
                'success', true,
                'duplicate', true,
                'remaining', COALESCE(v_current_balance, 0)
            );
        END IF;
    END IF;

    -- 2. Lock & Check Balance
    SELECT credit_balance INTO v_current_balance
    FROM public.supporter_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Handle missing wallet or insufficient funds
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient funds',
            'remaining', COALESCE(v_current_balance, 0)
        );
    END IF;

    -- 3. Deduct Credits using increment_credits (Atomic Re-use)
    -- We pass negative amount for spending
    PERFORM increment_credits(
        p_user_id, 
        -p_amount, 
        'USAGE', 
        p_description, 
        p_metadata,
        p_idempotency_key
    );

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'remaining', v_current_balance - p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
