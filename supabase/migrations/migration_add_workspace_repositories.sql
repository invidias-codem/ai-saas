-- Create workspace_repositories table
CREATE TABLE IF NOT EXISTS public.workspace_repositories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL,
    repo_full_name text NOT NULL,
    provider text NOT NULL DEFAULT 'github',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, repo_full_name, provider)
);

-- Note: Depending on existing RLS policies on workspaces, you may want to add RLS here.
-- For now, backend Admin client handles insertion/deletion.
