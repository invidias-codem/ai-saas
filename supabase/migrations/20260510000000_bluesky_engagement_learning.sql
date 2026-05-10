create table if not exists public.bluesky_engagement_learning (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  source_context text not null,
  author_did text,
  author_handle text not null,
  comment_uri text,
  comment_cid text,

  comment_text text not null,
  normalized_comment_text text not null,

  comment_class text not null,
  action_taken text not null,
  rationale text not null,
  suggested_reply_style text,

  packet_id text,
  packet_title text,
  topic_key text,

  reply_text text,
  post_uri text,
  post_topic text,
  is_recurring_question_candidate boolean not null default false
);

create index if not exists idx_bluesky_engagement_learning_created_at
  on public.bluesky_engagement_learning (created_at desc);

create index if not exists idx_bluesky_engagement_learning_comment_class
  on public.bluesky_engagement_learning (comment_class);

create index if not exists idx_bluesky_engagement_learning_action_taken
  on public.bluesky_engagement_learning (action_taken);

create index if not exists idx_bluesky_engagement_learning_packet_id
  on public.bluesky_engagement_learning (packet_id);

create index if not exists idx_bluesky_engagement_learning_author_handle
  on public.bluesky_engagement_learning (author_handle);

alter table public.bluesky_engagement_learning enable row level security;

drop policy if exists "service role can manage bluesky engagement learning"
on public.bluesky_engagement_learning;

create policy "service role can manage bluesky engagement learning"
  on public.bluesky_engagement_learning
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
