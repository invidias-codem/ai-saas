-- Migration: 20260408_bluesky_memory_context.sql
-- Extends bluesky_interactions with lightweight metadata for topical memory/CTA analysis.

ALTER TABLE IF EXISTS bluesky_interactions
  ADD COLUMN IF NOT EXISTS inferred_topics TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cta_kind TEXT;

COMMENT ON COLUMN bluesky_interactions.inferred_topics IS
  'High-level topic labels inferred from the interaction, e.g. ai, memory, tech';

COMMENT ON COLUMN bluesky_interactions.cta_kind IS
  'CTA attached to the generated reply, if any (site, donation, none)';
