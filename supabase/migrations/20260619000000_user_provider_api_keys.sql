-- Store user-owned provider API keys in Supabase Vault.
-- Uses Clerk user ids, so user_id is text (not auth.users UUID).

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.user_provider_api_keys (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
    secret_id UUID NOT NULL,
    secret_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.user_provider_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own provider key metadata" ON public.user_provider_api_keys;
CREATE POLICY "Users can read their own provider key metadata"
    ON public.user_provider_api_keys
    FOR SELECT
    USING (auth.jwt() ->> 'sub' = user_id);

DROP TRIGGER IF EXISTS handle_updated_at_user_provider_api_keys ON public.user_provider_api_keys;
CREATE TRIGGER handle_updated_at_user_provider_api_keys
    BEFORE UPDATE ON public.user_provider_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_user_provider_api_key(
    p_user_id TEXT,
    p_provider TEXT,
    p_api_key TEXT,
    p_secret_preview TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
    v_existing_secret_id UUID;
    v_secret_name TEXT;
BEGIN
    IF p_provider NOT IN ('openai', 'anthropic', 'google') THEN
        RAISE EXCEPTION 'Unsupported provider: %', p_provider;
    END IF;

    SELECT secret_id INTO v_existing_secret_id
    FROM public.user_provider_api_keys
    WHERE user_id = p_user_id AND provider = p_provider;

    v_secret_name := 'provider_key_' || p_provider || '_' || replace(p_user_id, '|', '_');

    IF v_existing_secret_id IS NOT NULL THEN
        PERFORM vault.update_secret(v_existing_secret_id, p_api_key, v_secret_name, p_provider || ' API key for user ' || p_user_id);
        v_secret_id := v_existing_secret_id;
    ELSE
        SELECT vault.create_secret(p_api_key, v_secret_name, p_provider || ' API key for user ' || p_user_id)
        INTO v_secret_id;
    END IF;

    INSERT INTO public.user_provider_api_keys (user_id, provider, secret_id, secret_preview, updated_at)
    VALUES (p_user_id, p_provider, v_secret_id, p_secret_preview, NOW())
    ON CONFLICT (user_id, provider)
    DO UPDATE SET
        secret_id = EXCLUDED.secret_id,
        secret_preview = EXCLUDED.secret_preview,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_provider_api_keys(p_user_id TEXT)
RETURNS TABLE(provider TEXT, api_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
    RETURN QUERY
    SELECT k.provider, s.decrypted_secret AS api_key
    FROM public.user_provider_api_keys k
    JOIN vault.decrypted_secrets s ON s.id = k.secret_id
    WHERE k.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_provider_api_key(p_user_id TEXT, p_provider TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id UUID;
BEGIN
    SELECT secret_id INTO v_secret_id
    FROM public.user_provider_api_keys
    WHERE user_id = p_user_id AND provider = p_provider;

    DELETE FROM public.user_provider_api_keys
    WHERE user_id = p_user_id AND provider = p_provider;

    IF v_secret_id IS NOT NULL THEN
        PERFORM vault.delete_secret(v_secret_id);
    END IF;
END;
$$;
