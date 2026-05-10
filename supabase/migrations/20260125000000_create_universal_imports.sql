-- ENABLE EXTENSION IF NOT ALREADY ENABLED
-- Required for uuid generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. CREATE IMPORTS TRACKING TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, -- Matches your existing schema's text-based user_id
    source_platform TEXT NOT NULL, -- 'openai', 'anthropic', 'gemini', etc.
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),
    
    -- File Metadata
    file_name TEXT,
    file_size_bytes BIGINT,
    
    -- Progress Metrics
    total_conversations INTEGER DEFAULT 0,
    processed_conversations INTEGER DEFAULT 0,
    imported_memories INTEGER DEFAULT 0,
    
    -- Diagnostics
    error_log JSONB DEFAULT '[]'::jsonb, -- Array of error objects { id, message, stack }
    metadata JSONB DEFAULT '{}'::jsonb,  -- Store parser version, options used, etc.
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Index for faster dashboard queries
    CONSTRAINT imports_user_id_idx UNIQUE (id, user_id) -- Composite optional, but good for RLS
);

-- Index for querying imports by user
CREATE INDEX IF NOT EXISTS idx_imports_user_id ON public.imports(user_id);


-- -----------------------------------------------------------------------------
-- 2. MODIFY CONVERSATIONS TABLE
-- -----------------------------------------------------------------------------
-- Add columns to track lineage of imported data
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS source_platform TEXT DEFAULT 'genie',
ADD COLUMN IF NOT EXISTS external_id TEXT, -- The ID from OpenAI/Claude
ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.imports(id) ON DELETE SET NULL;

-- Index for preventing duplicate imports (Optional but recommended)
-- This allows quick lookups to see if "chat-123" from "openai" already exists
CREATE INDEX IF NOT EXISTS idx_conversations_external_source 
ON public.conversations(user_id, source_platform, external_id) 
WHERE external_id IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own imports
CREATE POLICY "Users can view own imports" 
ON public.imports FOR SELECT 
USING (auth.uid()::text = user_id);

-- Policy: Users can insert their own imports
CREATE POLICY "Users can insert own imports" 
ON public.imports FOR INSERT 
WITH CHECK (auth.uid()::text = user_id);

-- Policy: Users can update their own imports (for status updates if client-driven, or backend service role)
CREATE POLICY "Users can update own imports" 
ON public.imports FOR UPDATE 
USING (auth.uid()::text = user_id);
