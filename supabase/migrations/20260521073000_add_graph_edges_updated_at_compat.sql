-- ============================================================
-- Migration: 20260521073000_add_graph_edges_updated_at_compat
-- Purpose:   Narrow compatibility repair for legacy graph_edges
--            projection writes that currently expect updated_at.
--
-- Context:
--   lib/memory/graphStore.ts updates public.graph_edges with:
--     - weight
--     - updated_at
--
--   Some deployed environments appear to have public.graph_edges
--   without an updated_at column, which causes PostgREST error:
--     PGRST204: Could not find the 'updated_at' column of
--     'graph_edges' in the schema cache
--
-- Scope:
--   Intentionally narrow. Does NOT refactor legacy graph tables,
--   world-model projections, or graph write paths.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'graph_edges'
  ) THEN
    ALTER TABLE public.graph_edges
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE public.graph_edges
    SET updated_at = NOW()
    WHERE updated_at IS NULL;

    ALTER TABLE public.graph_edges
      ALTER COLUMN updated_at SET DEFAULT NOW();

    ALTER TABLE public.graph_edges
      ALTER COLUMN updated_at SET NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_legacy_graph_edges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'graph_edges'
  ) THEN
    DROP TRIGGER IF EXISTS graph_edges_touch_updated_at ON public.graph_edges;

    CREATE TRIGGER graph_edges_touch_updated_at
      BEFORE UPDATE ON public.graph_edges
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_legacy_graph_edges_updated_at();
  END IF;
END $$;
