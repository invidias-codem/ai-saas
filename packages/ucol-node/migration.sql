-- UCOL Node Reference Implementation — Supabase Migration
-- Protocol: UCOL v0.1 | Date: 2026-03-13
-- Run: supabase db push OR paste into Supabase SQL Editor

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── Knowledge Items (K) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_knowledge (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL CHECK (length(content) <= 8192),
  type          TEXT NOT NULL CHECK (type IN ('FACT','CONSTRAINT','PREFERENCE','GOAL','ASSERTION')),
  confidence    FLOAT NOT NULL CHECK (confidence >= 0.3 AND confidence <= 1.0),
  source        TEXT NOT NULL,
  valid_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,
  provenance    TEXT NOT NULL,
  signature     TEXT NOT NULL,
  security_tier TEXT NOT NULL DEFAULT 'INTERNAL'
                CHECK (security_tier IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  embedding     vector(768),
  decay_weight  FLOAT NOT NULL DEFAULT 1.0 CHECK (decay_weight >= 0 AND decay_weight <= 1),
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ucol_knowledge_embedding_idx
  ON ucol_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS ucol_knowledge_tier_idx ON ucol_knowledge (security_tier);
CREATE INDEX IF NOT EXISTS ucol_knowledge_type_idx ON ucol_knowledge (type);
CREATE INDEX IF NOT EXISTS ucol_knowledge_valid_from_idx ON ucol_knowledge (valid_from);
CREATE INDEX IF NOT EXISTS ucol_knowledge_source_idx ON ucol_knowledge (source);

-- ── Artifacts (A) ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('CODE','SCHEMA','SPEC','TEST','CONFIG','MIGRATION','REPORT')),
  content       TEXT NOT NULL,   -- base64url encoded bytes
  mime_type     TEXT NOT NULL,
  version       TEXT NOT NULL DEFAULT '1.0.0',
  dependencies  UUID[] DEFAULT '{}',
  produced_by   TEXT NOT NULL,
  produced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum      TEXT NOT NULL,
  signature     TEXT NOT NULL,
  security_tier TEXT NOT NULL DEFAULT 'INTERNAL'
                CHECK (security_tier IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ucol_artifacts_tier_idx ON ucol_artifacts (security_tier);
CREATE INDEX IF NOT EXISTS ucol_artifacts_type_idx ON ucol_artifacts (type);
CREATE INDEX IF NOT EXISTS ucol_artifacts_produced_by_idx ON ucol_artifacts (produced_by);

-- ── History Items (H) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL,
  sequence    INTEGER NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('USER','AGENT','SYSTEM','TOOL')),
  content     TEXT NOT NULL CHECK (length(content) <= 131072),
  model_id    TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  distilled   BOOLEAN NOT NULL DEFAULT FALSE,
  delta_k     UUID[] DEFAULT '{}',
  delta_a     UUID[] DEFAULT '{}',
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS ucol_history_session_idx ON ucol_history (session_id);
CREATE INDEX IF NOT EXISTS ucol_history_distilled_idx ON ucol_history (session_id, distilled);

-- ── Relationships (R) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_relationships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      UUID NOT NULL,
  target      UUID NOT NULL,
  type        TEXT NOT NULL CHECK (type IN (
    'CAUSES','CONTRADICTS','SUPPORTS','DEPENDS_ON',
    'ASSERTED_BY','SUPERSEDES','IMPLEMENTS','VIOLATES'
  )),
  weight      FLOAT NOT NULL CHECK (weight >= 0 AND weight <= 1),
  confidence  FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence    UUID[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS ucol_relationships_source_idx ON ucol_relationships (source);
CREATE INDEX IF NOT EXISTS ucol_relationships_target_idx ON ucol_relationships (target);
CREATE INDEX IF NOT EXISTS ucol_relationships_type_idx ON ucol_relationships (type);

-- ── Sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              TEXT NOT NULL,
  granted_capabilities  TEXT[] NOT NULL DEFAULT '{"ROUTING","MEMORY"}',
  security_clearance    TEXT NOT NULL DEFAULT 'INTERNAL'
                        CHECK (security_clearance IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  expires_at            TIMESTAMPTZ NOT NULL,
  closed_at             TIMESTAMPTZ,
  context_id            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ucol_sessions_agent_idx ON ucol_sessions (agent_id);
CREATE INDEX IF NOT EXISTS ucol_sessions_expires_idx ON ucol_sessions (expires_at);

-- ── Missions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ucol_missions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'PENDING'
              CHECK (state IN ('PENDING','PLANNING','READY','EXECUTING','PAUSED','REVIEWING','COMPLETE','FAILED','CANCELLED')),
  spec        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ucol_mission_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  UUID NOT NULL REFERENCES ucol_missions(id) ON DELETE CASCADE,
  step_id     UUID NOT NULL,
  name        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'PENDING'
              CHECK (state IN ('PENDING','EXECUTING','COMPLETE','FAILED','SKIPPED')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  depends_on  UUID[] DEFAULT '{}',
  result      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ucol_mission_steps_mission_idx ON ucol_mission_steps (mission_id);

-- ── pgvector Similarity Search RPC ───────────────────────────────────────────
-- Called by src/store/index.ts Step 4 of the routing algorithm.
-- SecurityTier ordering enforced at the database level (defense in depth).

CREATE OR REPLACE FUNCTION ucol_search_knowledge(
  query_embedding   vector(768),
  match_threshold   float   DEFAULT 0.7,
  match_count       int     DEFAULT 20,
  max_tier          text    DEFAULT 'INTERNAL'
)
RETURNS TABLE (
  id             uuid,
  content        text,
  type           text,
  confidence     float,
  security_tier  text,
  valid_from     timestamptz,
  valid_until    timestamptz,
  similarity     float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    content,
    type,
    confidence,
    security_tier,
    valid_from,
    valid_until,
    1 - (embedding <=> query_embedding) AS similarity
  FROM ucol_knowledge
  WHERE
    embedding IS NOT NULL
    AND (1 - (embedding <=> query_embedding)) >= match_threshold
    AND (valid_until IS NULL OR valid_until > NOW())
    AND security_tier = ANY(
      CASE max_tier
        WHEN 'RESTRICTED'    THEN ARRAY['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED']
        WHEN 'CONFIDENTIAL'  THEN ARRAY['PUBLIC','INTERNAL','CONFIDENTIAL']
        WHEN 'INTERNAL'      THEN ARRAY['PUBLIC','INTERNAL']
        ELSE                      ARRAY['PUBLIC']
      END
    )
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── RLS Policies ──────────────────────────────────────────────────────────────
-- Enable RLS on all tables (service role bypasses; agent tokens use session-scoped policies)

ALTER TABLE ucol_knowledge     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_artifacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_mission_steps ENABLE ROW LEVEL SECURITY;

-- Service role can do anything (used by the node server)
CREATE POLICY "service_role_all" ON ucol_knowledge      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_artifacts      FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_history        FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_relationships  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_sessions       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_missions       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON ucol_mission_steps  FOR ALL TO service_role USING (true);

-- ── Indexes for decay weight maintenance ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS ucol_knowledge_decay_idx ON ucol_knowledge (last_reinforced_at, decay_weight);

-- ── Trigger: update updated_at on missions ────────────────────────────────────
CREATE OR REPLACE FUNCTION ucol_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER ucol_missions_updated_at
  BEFORE UPDATE ON ucol_missions
  FOR EACH ROW EXECUTE FUNCTION ucol_set_updated_at();

CREATE TRIGGER ucol_mission_steps_updated_at
  BEFORE UPDATE ON ucol_mission_steps
  FOR EACH ROW EXECUTE FUNCTION ucol_set_updated_at();

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Run `supabase db push` or paste this into the Supabase SQL Editor.
-- Required extension: pgvector (enable via Supabase Dashboard → Extensions).
