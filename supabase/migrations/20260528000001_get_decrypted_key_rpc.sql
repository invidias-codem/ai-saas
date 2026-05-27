-- Migration: 20260528000001_get_decrypted_key_rpc.sql

CREATE OR REPLACE FUNCTION public.get_user_openai_key(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Elevates privileges to allow querying the vault
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_decrypted_key TEXT;
BEGIN
    -- 1. Get the secret mapping for the user
    SELECT secret_id INTO v_secret_id
    FROM public.user_api_keys
    WHERE user_id = p_user_id;

    IF v_secret_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Fetch the decrypted string from the vault
    SELECT decrypted_secret INTO v_decrypted_key
    FROM vault.decrypted_secrets
    WHERE id = v_secret_id;

    RETURN v_decrypted_key;
END;
$$;
