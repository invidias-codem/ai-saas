-- Operating profiles slice
-- Defines how Tech Genie behaves inside a workspace so onboarding can
-- create a personalized runtime mode, not just a container.

create table if not exists public.operating_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  slug text not null,
  mode text not null default 'copilot',
  description text,
  is_default boolean not null default false,
  is_system_preset boolean not null default false,

  cost_sensitivity text not null default 'medium',
  latency_preference text not null default 'balanced',
  memory_aggressiveness text not null default 'balanced',
  retrieval_depth text not null default 'standard',
  tool_use_level text not null default 'limited',
  premium_escalation_policy text not null default 'conditional',

  review_before_action boolean not null default true,
  allow_agentic_runs boolean not null default false,
  allow_external_actions boolean not null default false,
  citation_preference boolean not null default false,

  default_output_style text not null default 'chat',
  artifact_bias text not null default 'medium',
  context_window_budget text not null default 'medium',

  routing_overrides jsonb not null default '{}'::jsonb,
  tool_policies jsonb not null default '{}'::jsonb,
  memory_policies jsonb not null default '{}'::jsonb,
  ui_preferences jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operating_profiles_mode_check check (
    mode in ('copilot', 'research', 'agentic', 'drafting', 'memory_native', 'custom')
  ),
  constraint operating_profiles_cost_sensitivity_check check (
    cost_sensitivity in ('low', 'medium', 'high')
  ),
  constraint operating_profiles_latency_preference_check check (
    latency_preference in ('fast', 'balanced', 'deep')
  ),
  constraint operating_profiles_memory_aggressiveness_check check (
    memory_aggressiveness in ('light', 'balanced', 'strong')
  ),
  constraint operating_profiles_retrieval_depth_check check (
    retrieval_depth in ('minimal', 'standard', 'deep')
  ),
  constraint operating_profiles_tool_use_level_check check (
    tool_use_level in ('none', 'limited', 'moderate', 'high')
  ),
  constraint operating_profiles_premium_escalation_policy_check check (
    premium_escalation_policy in ('rare', 'conditional', 'allowed', 'preferred')
  ),
  constraint operating_profiles_default_output_style_check check (
    default_output_style in ('chat', 'report', 'brief', 'draft', 'checklist')
  ),
  constraint operating_profiles_artifact_bias_check check (
    artifact_bias in ('low', 'medium', 'high')
  ),
  constraint operating_profiles_context_window_budget_check check (
    context_window_budget in ('small', 'medium', 'large')
  )
);

create unique index if not exists operating_profiles_user_slug_idx
  on public.operating_profiles (user_id, slug);

create unique index if not exists operating_profiles_default_user_idx
  on public.operating_profiles (user_id)
  where is_default = true;

create index if not exists operating_profiles_user_id_idx
  on public.operating_profiles (user_id);

alter table public.workspaces
  add column if not exists default_operating_profile_id uuid null references public.operating_profiles(id) on delete set null;

alter table public.conversations
  add column if not exists operating_profile_id uuid null references public.operating_profiles(id) on delete set null;

create index if not exists workspaces_default_operating_profile_id_idx
  on public.workspaces (default_operating_profile_id);

create index if not exists conversations_operating_profile_id_idx
  on public.conversations (operating_profile_id);

create trigger operating_profiles_touch_updated_at
before update on public.operating_profiles
for each row
execute function public.touch_updated_at();
