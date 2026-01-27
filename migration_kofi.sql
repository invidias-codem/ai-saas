-- Create table for Ko-fi transactions
CREATE TABLE IF NOT EXISTS public.kofi_donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kofi_transaction_id TEXT UNIQUE NOT NULL, -- From Ko-fi JSON
    user_email TEXT, -- To match with Genie user
    amount_usd DECIMAL(10,2) NOT NULL,
    tier_name TEXT,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update User Credits Table (if not exists)
CREATE TABLE IF NOT EXISTS public.supporter_credits (
    user_id TEXT PRIMARY KEY,
    credit_balance INTEGER DEFAULT 10,
    is_supporter BOOLEAN DEFAULT FALSE,
    total_donated_usd DECIMAL(10,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.kofi_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_credits ENABLE ROW LEVEL SECURITY;

-- Service Role has full access. Users can view their own credits.
CREATE POLICY "View own credits" ON public.supporter_credits 
    FOR SELECT USING (auth.uid()::text = user_id);

-- Function to safely increment credits (atomic update)
CREATE OR REPLACE FUNCTION increment_credits(user_id TEXT, amount INTEGER)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.supporter_credits (user_id, credit_balance, is_supporter, updated_at)
  VALUES (user_id, amount + 10, true, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET 
    credit_balance = public.supporter_credits.credit_balance + amount,
    is_supporter = true,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
