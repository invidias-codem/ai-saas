-- Ensure the Vault extension is active
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Create the mapping table
CREATE TABLE public.user_api_keys (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    secret_id UUID NOT NULL, 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Secure the mapping table with strict RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only read their own key mappings"
    ON public.user_api_keys
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert/update their own key mappings"
    ON public.user_api_keys
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER handle_updated_at_user_api_keys
    BEFORE UPDATE ON public.user_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_updated_at();
