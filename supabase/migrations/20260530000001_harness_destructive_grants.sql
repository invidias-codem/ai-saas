-- Migration to add explicit destructive capability tier

-- 1. Add allow_destructive to harness_root_grants
ALTER TABLE public.harness_root_grants 
ADD COLUMN IF NOT EXISTS allow_destructive BOOLEAN NOT NULL DEFAULT false;

-- 2. No changes required to RLS, as it inherits existing insert/select policies.
