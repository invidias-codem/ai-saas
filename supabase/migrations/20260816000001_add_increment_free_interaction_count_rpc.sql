-- Atomic increment of free_interaction_count with threshold detection

create or replace function public.increment_free_interaction_count(target_user_id text)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  update public.subscriptions
  set free_interaction_count = free_interaction_count + 1,
      updated_at = now()
  where clerk_user_id = target_user_id
    and tier = 'free'
  returning free_interaction_count into new_count;

  -- If no row updated (user might be pro or no row exists), return 0
  if new_count is null then
    return 0;
  end if;

  return new_count;
end;
$$;
