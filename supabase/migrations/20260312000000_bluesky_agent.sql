-- Migration: 20260312_bluesky_agent.sql
-- Creates tables for the Bluesky engagement agent.
-- Tables: bluesky_poll_state, bluesky_interactions
-- RLS: service role only (anon and authenticated roles have no access)

-- ── bluesky_poll_state ────────────────────────────────────────────────────────
-- Simple key/value store for the mention poller's cursor state.

CREATE TABLE IF NOT EXISTS bluesky_poll_state (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE bluesky_poll_state ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (safe to re-run)
DROP POLICY IF EXISTS "No public access — bluesky_poll_state" ON bluesky_poll_state;

-- Deny all access to anon and authenticated roles; service role bypasses RLS
CREATE POLICY "No public access — bluesky_poll_state"
  ON bluesky_poll_state
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ── bluesky_interactions ──────────────────────────────────────────────────────
-- Log of every mention processed and the agent's response.

CREATE TABLE IF NOT EXISTS bluesky_interactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_uri    TEXT        NOT NULL UNIQUE,
  author_handle  TEXT        NOT NULL,
  author_did     TEXT        NOT NULL,
  mention_text   TEXT        NOT NULL,
  response_text  TEXT,
  response_uri   TEXT,
  facts_extracted INT        NOT NULL DEFAULT 0,
  routed_to      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for rate-limit lookups (author_did + created_at)
CREATE INDEX IF NOT EXISTS idx_bluesky_interactions_author_created
  ON bluesky_interactions (author_did, created_at DESC);

-- Enable Row Level Security
ALTER TABLE bluesky_interactions ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies (safe to re-run)
DROP POLICY IF EXISTS "No public access — bluesky_interactions" ON bluesky_interactions;

-- Deny all access to anon and authenticated roles; service role bypasses RLS
CREATE POLICY "No public access — bluesky_interactions"
  ON bluesky_interactions
  FOR ALL
  TO anon, authenticated
  USING (false);

-- ── Comments ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE bluesky_poll_state IS
  'Stores persistent state for the Bluesky MentionPoller (e.g. notification cursor)';

COMMENT ON TABLE bluesky_interactions IS
  'Audit log of every Bluesky mention processed by the Tech Genie engagement agent';
