-- Migration: 20260312_ucol_tool_registry
-- UCOL Tool Layer: registry of installed CLI-Anything harnesses + execution audit log

-- ─── Tool Registry ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ucol_tool_registry (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        UNIQUE NOT NULL,               -- "supabase" | "gh" | "firebase"
  binary         TEXT        NOT NULL,                      -- "cli-anything-supabase"
  version        TEXT,                                      -- from binary --version
  capabilities   JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- top-level command groups
  task_types     JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- UCOL task type mappings
  is_available   BOOLEAN     NOT NULL DEFAULT true,         -- false = not found in PATH
  installed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tool Execution Log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ucol_tool_executions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name     TEXT        NOT NULL,
  command       TEXT        NOT NULL,                -- e.g. "gh pr list"
  args          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  result_ok     BOOLEAN     NOT NULL,
  duration_ms   INTEGER,
  user_id       TEXT,                                -- Clerk userId
  session_id    TEXT,
  error_message TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tool_executions_tool_name
  ON ucol_tool_executions(tool_name);

CREATE INDEX IF NOT EXISTS idx_tool_executions_executed_at
  ON ucol_tool_executions(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_executions_user_id
  ON ucol_tool_executions(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tool_registry_available
  ON ucol_tool_registry(is_available)
  WHERE is_available = true;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE ucol_tool_registry   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ucol_tool_executions ENABLE ROW LEVEL SECURITY;

-- Service role only — these tables are internal infrastructure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ucol_tool_registry' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON ucol_tool_registry
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ucol_tool_executions' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON ucol_tool_executions
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── Seed: Known Harnesses ───────────────────────────────────────────────────
-- Pre-populate registry with the 3 known harnesses (availability set to false
-- until the sync cron verifies they are installed in the runtime PATH).

INSERT INTO ucol_tool_registry (name, binary, capabilities, task_types, is_available)
VALUES
  (
    'supabase',
    'cli-anything-supabase',
    '["project","db","migration","functions","inspect","status"]'::jsonb,
    '["database_query","migration","db_inspect","edge_functions"]'::jsonb,
    false
  ),
  (
    'gh',
    'cli-anything-gh',
    '["pr","issue","run","workflow","repo","release"]'::jsonb,
    '["repo_management","pr_management","ci_status","issue_tracking","deployment_debug"]'::jsonb,
    false
  ),
  (
    'firebase',
    'cli-anything-firebase',
    '["deploy","hosting","functions","firestore","projects","emulators","apps"]'::jsonb,
    '["deployment","hosting","auth_management","firestore_ops"]'::jsonb,
    false
  )
ON CONFLICT (name) DO NOTHING;
