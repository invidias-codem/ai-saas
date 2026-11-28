-- Add active GitHub repo to workspace
ALTER TABLE IF EXISTS public.workspaces
  ADD COLUMN IF NOT EXISTS active_github_repo TEXT DEFAULT NULL;

-- Optional: index if you expect frequent workspace lookups by repo
CREATE INDEX IF NOT EXISTS idx_workspaces_active_github_repo
  ON public.workspaces (active_github_repo);
