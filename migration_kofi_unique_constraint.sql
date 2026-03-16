-- Add unique constraint to kofi_donations.kofi_transaction_id
-- We use a unique index which is functionally equivalent and often preferred for performance

-- Ensure table exists first
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.kofi_donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kofi_transaction_id TEXT NOT NULL,
    user_email TEXT,
    amount_usd DECIMAL,
    tier_name TEXT,
    is_processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kofi_donations_kofi_transaction_id_key'
    ) THEN
        ALTER TABLE public.kofi_donations
        ADD CONSTRAINT kofi_donations_kofi_transaction_id_key UNIQUE (kofi_transaction_id);
    END IF;
END $$;
