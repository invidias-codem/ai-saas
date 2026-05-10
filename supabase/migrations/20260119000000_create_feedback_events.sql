-- Feedback events capture table (Phase 1 of Continuous Learning)
-- Stores user feedback + model context to support dataset curation + eval.

-- Enable UUID extension if not present
create extension if not exists "uuid-ossp";

create table if not exists public.feedback_events (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),

  user_id text null, -- Clerk ID
  session_id text null,
  source text not null default 'web',

  conversation_id text null,
  message_id text null,

  prompt_version text null,
  model text null,

  input text null,
  output text null,

  rating int null,
  feedback_text text null,

  labels jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  retrieval_context_ids jsonb not null default '[]'::jsonb
);

-- Indexes for common queries
create index if not exists idx_feedback_events_created_at
  on public.feedback_events (created_at desc);

create index if not exists idx_feedback_events_user_id
  on public.feedback_events (user_id);

create index if not exists idx_feedback_events_conversation_id
  on public.feedback_events (conversation_id);

-- Optimization: Index for rating-based filtering (important for curation)
create index if not exists idx_feedback_events_rating
  on public.feedback_events (rating)
  where rating is not null;

-- Enable RLS
alter table public.feedback_events enable row level security;

-- Users can view their own feedback (service role bypasses RLS for inserts)
drop policy if exists "Users can view their own feedback" on public.feedback_events;
create policy "Users can view their own feedback"
  on public.feedback_events
  for select
  using (auth.uid()::text = user_id);
