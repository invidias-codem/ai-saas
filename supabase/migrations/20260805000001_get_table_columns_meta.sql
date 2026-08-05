-- ============================================================
-- Migration: 20260805000001_get_table_columns_meta.sql
-- Purpose: RPC to introspect PostgreSQL table columns for
--          auto-generated tool signature synthesis.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_table_columns_meta (
  target_table text
)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable text
)
LANGUAGE sql
AS $$
  SELECT
    column_name,
    data_type,
    is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = target_table
  ORDER BY ordinal_position;
$$;
