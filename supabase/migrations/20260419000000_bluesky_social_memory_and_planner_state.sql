-- Migration: 20260419_bluesky_social_memory_and_planner_state.sql
-- Patched to tolerate production schema drift where topic_cluster
-- was not added in an earlier migration, and to align fully with
-- planner fields used by ProactivePostPlanner.

ALTER TABLE IF EXISTS bluesky_proactive_posts
  ADD COLUMN IF NOT EXISTS intent TEXT,
  ADD COLUMN IF NOT EXISTS source_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS quality_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
  ADD COLUMN IF NOT EXISTS publication_url TEXT,
  ADD COLUMN IF NOT EXISTS publication_title TEXT,
  ADD COLUMN IF NOT EXISTS topic_cluster TEXT,
  ADD COLUMN IF NOT EXISTS audience_mode TEXT,
  ADD COLUMN IF NOT EXISTS rhetorical_pattern TEXT,
  ADD COLUMN IF NOT EXISTS freshness_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS usefulness_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS staleness_flags JSONB,
  ADD COLUMN IF NOT EXISTS decision_notes JSONB;

CREATE INDEX IF NOT EXISTS idx_bluesky_proactive_posts_created_at
  ON bluesky_proactive_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bluesky_proactive_posts_lane_created
  ON bluesky_proactive_posts (lane, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bluesky_proactive_posts_topic_cluster_created
  ON bluesky_proactive_posts (topic_cluster, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bluesky_proactive_posts_suppressed_created
  ON bluesky_proactive_posts (suppressed, created_at DESC);

CREATE TABLE IF NOT EXISTS bluesky_actor_memory (
  actor_did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  display_name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reply_at TIMESTAMPTZ,
  engagement_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  topics_engaged JSONB NOT NULL DEFAULT '[]'::jsonb,
  relationship_summary TEXT,
  tone_preference_guess TEXT,
  last_reply_summary TEXT,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_actor_memory_last_interaction
  ON bluesky_actor_memory (last_interaction_at DESC);

CREATE TABLE IF NOT EXISTS bluesky_conversation_memory (
  thread_root_uri TEXT PRIMARY KEY,
  actor_did TEXT NOT NULL,
  actor_handle TEXT,
  last_topic TEXT,
  last_agent_position TEXT,
  open_question TEXT,
  last_summary TEXT,
  reply_depth INTEGER NOT NULL DEFAULT 0,
  last_mention_uri TEXT,
  last_reply_uri TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bluesky_conversation_memory_actor
  ON bluesky_conversation_memory (actor_did, updated_at DESC);

COMMENT ON COLUMN bluesky_proactive_posts.intent IS
  'Planner-selected post intent such as thought, reaction, distribution, or journal';

COMMENT ON COLUMN bluesky_proactive_posts.source_confidence IS
  'Confidence score for the grounding/source packet used to generate the post';

COMMENT ON COLUMN bluesky_proactive_posts.quality_score IS
  'Planner quality score for the generated proactive post candidate';

COMMENT ON COLUMN bluesky_proactive_posts.suppressed IS
  'Whether the planner suppressed this candidate instead of publishing it';

COMMENT ON COLUMN bluesky_proactive_posts.suppression_reason IS
  'Reason why the planner suppressed the candidate';

COMMENT ON COLUMN bluesky_proactive_posts.publication_url IS
  'Publication URL used when the proactive post was planned in distribution mode';

COMMENT ON COLUMN bluesky_proactive_posts.publication_title IS
  'Publication title used when the proactive post was planned in distribution mode';

COMMENT ON COLUMN bluesky_proactive_posts.topic_cluster IS
  'Normalized topic cluster key used for diversity control and recency checks';

COMMENT ON COLUMN bluesky_proactive_posts.audience_mode IS
  'Planner-selected audience mode for the proactive post';

COMMENT ON COLUMN bluesky_proactive_posts.rhetorical_pattern IS
  'Planner-selected rhetorical pattern used to diversify post structure';

COMMENT ON COLUMN bluesky_proactive_posts.freshness_score IS
  'Planner freshness score for topic/intent/source novelty';

COMMENT ON COLUMN bluesky_proactive_posts.usefulness_score IS
  'Planner usefulness score estimating whether the post says something worth reading';

COMMENT ON COLUMN bluesky_proactive_posts.staleness_flags IS
  'JSON array of planner freshness/staleness diagnostics';

COMMENT ON COLUMN bluesky_proactive_posts.decision_notes IS
  'JSON array of planner decision notes for debugging and evaluation';

COMMENT ON TABLE bluesky_actor_memory IS
  'Persistent social memory for recurring Bluesky actors/followers';

COMMENT ON TABLE bluesky_conversation_memory IS
  'Thread-level memory for Bluesky conversations and follow-up continuity';
