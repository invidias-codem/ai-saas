-- Add composite indices for performance
CREATE INDEX IF NOT EXISTS idx_memory_bank_user_type ON public.memory_bank (user_id, type);
CREATE INDEX IF NOT EXISTS idx_memory_bank_user_extracted_at ON public.memory_bank (user_id, extracted_at DESC);

-- Enable RLS
ALTER TABLE public.memory_bank ENABLE ROW LEVEL SECURITY;

-- Ensure RLS policy exists for users to read their own memories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'memory_bank'
          AND policyname = 'Users can view their own memories'
    ) THEN
        CREATE POLICY "Users can view their own memories" ON public.memory_bank
            FOR SELECT
            USING (auth.uid()::text = user_id);
    END IF;
END $$;

-- Ensure RLS policy exists for users to insert their own memories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'memory_bank'
          AND policyname = 'Users can insert their own memories'
    ) THEN
        CREATE POLICY "Users can insert their own memories" ON public.memory_bank
            FOR INSERT
            WITH CHECK (auth.uid()::text = user_id);
    END IF;
END $$;

-- Ensure RLS policy exists for users to update their own memories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'memory_bank'
          AND policyname = 'Users can update their own memories'
    ) THEN
        CREATE POLICY "Users can update their own memories" ON public.memory_bank
            FOR UPDATE
            USING (auth.uid()::text = user_id)
            WITH CHECK (auth.uid()::text = user_id);
    END IF;
END $$;

-- Ensure RLS policy exists for users to delete their own memories
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'memory_bank'
          AND policyname = 'Users can delete their own memories'
    ) THEN
        CREATE POLICY "Users can delete their own memories" ON public.memory_bank
            FOR DELETE
            USING (auth.uid()::text = user_id);
    END IF;
END $$;
