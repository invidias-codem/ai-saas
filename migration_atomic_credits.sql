-- Add idempotency_key to credit_transactions if it doesn't exist
ALTER TABLE public.credit_transactions 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_transactions_idempotency 
ON public.credit_transactions(idempotency_key);

-- RPC: spend_credits
-- Returns formatted JSON: { "success": boolean, "duplicate": boolean, "remaining": integer, "error": string }
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
    v_existing_tx RECORD;
BEGIN
    -- 1. Check for Idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_tx 
        FROM public.credit_transactions 
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            -- Get current balance to return consistent structure
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

    -- 2. Lock User Row & Check Balance
    -- We assume the user exists in user_profiles, but supporter_credits might be missing if they haven't been initialized
    -- Implementation detail: increment_credits initializes the row. We should probably do the same or fail.
    -- For now, fail if no record, or assume 10 (default) if we want to auto-init. 
    -- Safer to fail or use 0 if row missing.
    
    SELECT credit_balance INTO v_current_balance
    FROM public.supporter_credits
    WHERE user_id = p_user_id
    FOR UPDATE; -- Lock this row

    IF v_current_balance IS NULL THEN
        -- Optional: Auto-initialize if policy allows, or return error. 
        -- Given legacy system had defaults, we might return error 'User wallet not initialized'.
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Wallet not found'
        );
    END IF;

    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient funds',
            'remaining', v_current_balance
        );
    END IF;

    -- 3. Deduct Credits
    UPDATE public.supporter_credits
    SET credit_balance = credit_balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- 4. Log Transaction
    INSERT INTO public.credit_transactions (
        user_id, 
        amount, 
        transaction_type, 
        description, 
        metadata, 
        idempotency_key
    )
    VALUES (
        p_user_id, 
        -p_amount, -- Negative for spend
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
