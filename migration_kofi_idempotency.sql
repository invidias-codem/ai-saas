-- RPC: process_kofi_donation
-- Handles idempotency and credit granting atomically
CREATE OR REPLACE FUNCTION process_kofi_donation(
    p_kofi_transaction_id TEXT,
    p_email TEXT,
    p_amount_usd DECIMAL,
    p_credits_to_add INTEGER,
    p_tier_name TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_existing_id UUID;
    v_is_processed BOOLEAN;
    v_user_id TEXT;
BEGIN
    -- 1. Idempotency Check
    SELECT id, is_processed INTO v_existing_id, v_is_processed
    FROM public.kofi_donations
    WHERE kofi_transaction_id = p_kofi_transaction_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'processed', v_is_processed
        );
    END IF;

    -- 2. Find User
    SELECT user_id INTO v_user_id
    FROM public.user_profiles
    WHERE email = p_email;

    -- 3. Insert Donation
    INSERT INTO public.kofi_donations (
        kofi_transaction_id,
        user_email,
        amount_usd,
        tier_name,
        is_processed
    ) VALUES (
        p_kofi_transaction_id,
        p_email,
        p_amount_usd,
        p_tier_name,
        (v_user_id IS NOT NULL)
    );

    -- 4. Grant Credits if user found
    IF v_user_id IS NOT NULL THEN
        -- Call existing increment_credits function
        PERFORM increment_credits(
            v_user_id,
            p_credits_to_add,
            'PURCHASE',
            'Ko-fi Donation: ' || p_amount_usd || ' USD',
            p_metadata,
            p_kofi_transaction_id -- Use Ko-fi ID as the idempotency key
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'user_found', (v_user_id IS NOT NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
