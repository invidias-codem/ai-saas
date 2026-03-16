-- Migration: Add Import Wizard Tables & Columns
-- Date: 2026-01-26

-- 1. Create import_jobs table (must exist before we reference it)
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    source_platform TEXT NOT NULL,
    total_conversations INTEGER DEFAULT 0,
    processed_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    extracted_facts INTEGER DEFAULT 0,
    stored_memories INTEGER DEFAULT 0,
    error_log JSONB,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON public.import_jobs(user_id);

-- 2. Add columns to memory_bank for tracking import source
ALTER TABLE public.memory_bank 
ADD COLUMN IF NOT EXISTS import_job_id UUID REFERENCES public.import_jobs(id),
ADD COLUMN IF NOT EXISTS source_platform TEXT,
ADD COLUMN IF NOT EXISTS original_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS extraction_type TEXT; -- e.g. 'fact', 'preference'

CREATE INDEX IF NOT EXISTS idx_memory_bank_import ON public.memory_bank(import_job_id);

-- 3. Add column to user_profiles for imported preferences (optional/future-proof)
-- ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS imported_preferences JSONB;
