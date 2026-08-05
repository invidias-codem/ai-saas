CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  task_type TEXT NOT NULL,
  input TEXT NOT NULL,
  context TEXT,
  routing_tier TEXT,
  model_preference TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  result TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_created
  ON public.agent_tasks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_workspace_status
  ON public.agent_tasks (workspace_id, status);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent tasks"
  ON public.agent_tasks
  FOR SELECT
  USING (user_id = auth.uid()::text OR user_id = 'local-dev');

CREATE POLICY "Users can insert own agent tasks"
  ON public.agent_tasks
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text OR user_id = 'local-dev');

CREATE POLICY "Users can update own agent tasks"
  ON public.agent_tasks
  FOR UPDATE
  USING (user_id = auth.uid()::text OR user_id = 'local-dev');
