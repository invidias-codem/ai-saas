-- 1. Supporter Credits (The User's "Wallet")
CREATE TABLE IF NOT EXISTS public.supporter_credits (
    user_id TEXT PRIMARY KEY,
    credit_balance INTEGER DEFAULT 10, -- 10 Free credits for everyone
    is_supporter BOOLEAN DEFAULT false, -- True if they have donated at least once
    total_donated_usd DECIMAL(10,2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Donation Log (History of support)
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    platform TEXT DEFAULT 'paypal', -- 'paypal' or 'cashapp'
    transaction_id TEXT, -- The PayPal Transaction ID
    amount_donated DECIMAL(10,2) NOT NULL,
    credits_gifted INTEGER NOT NULL,
    message TEXT, -- Optional "Note to Joshua"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Security Policies
ALTER TABLE public.supporter_credits ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own credits
CREATE POLICY "View own credits" ON public.supporter_credits 
    FOR SELECT USING (auth.uid()::text = user_id);

-- Allow server (service role) full access (implicit, but good to note if using strict policies)
-- No insert/update policy for users, as only the server should modify balances via API
