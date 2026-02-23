-- Fix missing email column in user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- Ensure other columns exist as well
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Reload schema cache (optional, often handled by restarting client or via dashboard)
NOTIFY pgrst, 'reload config';
