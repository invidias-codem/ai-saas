-- 1. Create user_profiles for identity mapping (Clerk <-> Supabase <-> Ko-fi)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id TEXT PRIMARY KEY, -- Matches Clerk user.id
    email TEXT UNIQUE NOT NULL,
    kofi_email TEXT, -- Optional override if they use a different email on Ko-fi
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid()::text = user_id);

-- 2. Create credit_transactions for audit trail
CREATE TYPE credit_transaction_type AS ENUM ('PURCHASE', 'USAGE', 'BONUS', 'REFUND', 'MANUAL_ADJUSTMENT');

CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL REFERENCES public.supporter_credits(user_id),
    amount INTEGER NOT NULL, -- Positive for add, negative for spend
    transaction_type credit_transaction_type NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb, -- Store Ko-fi Transaction ID, Job ID, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for credit_transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transactions" ON public.credit_transactions
    FOR SELECT USING (auth.uid()::text = user_id);

-- 3. Update increment_credits to log usage
CREATE OR REPLACE FUNCTION increment_credits(
    p_user_id TEXT, 
    p_amount INTEGER, 
    p_type credit_transaction_type DEFAULT 'PURCHASE', 
    p_description TEXT DEFAULT 'Credits added',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  -- Upsert credits
  INSERT INTO public.supporter_credits (user_id, credit_balance, is_supporter, updated_at)
  VALUES (p_user_id, p_amount + 10, true, NOW()) -- +10 is base if new
  ON CONFLICT (user_id)
  DO UPDATE SET 
    credit_balance = public.supporter_credits.credit_balance + p_amount,
    is_supporter = true,
    updated_at = NOW();

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, transaction_type, description, metadata)
  VALUES (p_user_id, p_amount, p_type, p_description, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
