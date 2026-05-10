-- ─── Procedural Memory & State Diffs (UCOL Foundation Agent Phase 1+3) ────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Procedural Memory ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ucol_procedural_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  task_type text NOT NULL,
  task_description text NOT NULL,
  task_signature vector(768),
  tool_sequence jsonb NOT NULL DEFAULT '[]',
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  avg_latency_ms int NOT NULL DEFAULT 0,
  confidence float GENERATED ALWAYS AS (
    CASE WHEN (success_count + failure_count) = 0 THEN 0
    ELSE success_count::float / (success_count + failure_count)
    END
  ) STORED,
  promoted_at timestamptz,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_task_type
  ON ucol_procedural_memory(task_type);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_user
  ON ucol_procedural_memory(user_id);

CREATE INDEX IF NOT EXISTS idx_procedural_memory_signature
  ON ucol_procedural_memory USING ivfflat (task_signature vector_cosine_ops)
  WITH (lists = 100);

-- RLS
ALTER TABLE ucol_procedural_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_procedural_memory" ON ucol_procedural_memory
  FOR ALL USING (user_id = current_setting('app.user_id', true));

-- ─── State Diffs ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ucol_state_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tool text NOT NULL,
  command text NOT NULL,
  args jsonb NOT NULL DEFAULT '[]',
  state_before jsonb,
  state_after jsonb,
  delta text[],
  success boolean NOT NULL DEFAULT false,
  latency_ms int,
  procedure_id uuid REFERENCES ucol_procedural_memory(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ucol_state_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_state_diffs" ON ucol_state_diffs
  FOR ALL USING (user_id = current_setting('app.user_id', true));

-- ─── RPC: cosine similarity search for procedural memory ─────────────────────
-- Returns records ordered by similarity to the provided embedding.
-- signature_query is a JSON array of floats (768-dim).

CREATE OR REPLACE FUNCTION match_procedural_memory(
  p_user_id text,
  p_embedding vector(768),
  p_task_type text DEFAULT NULL,
  p_threshold float DEFAULT 0.88,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  user_id text,
  task_type text,
  task_description text,
  tool_sequence jsonb,
  success_count int,
  failure_count int,
  avg_latency_ms int,
  confidence float,
  promoted_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.task_type,
    m.task_description,
    m.tool_sequence,
    m.success_count,
    m.failure_count,
    m.avg_latency_ms,
    m.confidence,
    m.promoted_at,
    m.last_used_at,
    m.created_at,
    (1.0 - (m.task_signature <=> p_embedding))::float AS similarity
  FROM ucol_procedural_memory m
  WHERE
    m.user_id = p_user_id
    AND m.task_signature IS NOT NULL
    AND (p_task_type IS NULL OR m.task_type = p_task_type)
    AND (1.0 - (m.task_signature <=> p_embedding)) >= p_threshold
  ORDER BY m.task_signature <=> p_embedding
  LIMIT p_limit;
END;
$$;
