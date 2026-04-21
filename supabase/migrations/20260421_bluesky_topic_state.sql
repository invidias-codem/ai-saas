-- Migration: 20260421_bluesky_topic_state.sql
-- Adds the planner topic-state table used for oversaturation tracking,
-- diversity control, and posting cooldown heuristics.

CREATE TABLE IF NOT EXISTS bluesky_topic_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  lane TEXT NOT NULL,
  last_posted_at TIMESTAMPTZ,
  post_count_7d INTEGER NOT NULL DEFAULT 0,
  post_count_30d INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic, lane)
);

CREATE INDEX IF NOT EXISTS idx_bluesky_topic_state_updated_at
  ON bluesky_topic_state (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bluesky_topic_state_topic_lane
  ON bluesky_topic_state (topic, lane);

COMMENT ON TABLE bluesky_topic_state IS
  'Planner state for Bluesky topic saturation, diversity control, and cooldown tracking';

COMMENT ON COLUMN bluesky_topic_state.topic IS
  'Normalized planner topic cluster key';

COMMENT ON COLUMN bluesky_topic_state.lane IS
  'Planner lane for the topic state row (ai, memory, tech)';
