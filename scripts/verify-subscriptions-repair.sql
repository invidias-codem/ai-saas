-- Run as the migration owner after applying 20261011140000 alone.
-- Every synthetic write is rolled back.
begin;
do $$
declare
  free_user text := 'repair-test-free-' || gen_random_uuid()::text;
  paid_user text := 'repair-test-paid-' || gen_random_uuid()::text;
  paid_until timestamptz := now() + interval '30 days';
begin
  if public.increment_free_interaction_count(free_user) <> 1 then
    raise exception 'new free user was not counted';
  end if;
  if public.increment_free_interaction_count(free_user) <> 2 then
    raise exception 'existing free user was not incremented';
  end if;
  insert into public.subscriptions (clerk_user_id, tier, premium_until)
    values (paid_user, 'pro', paid_until)
    on conflict (clerk_user_id) do update set premium_until = excluded.premium_until;
  if public.increment_free_interaction_count(paid_user) <> 0 then
    raise exception 'paid user was counted as free';
  end if;
  if not exists (select 1 from public.subscriptions where clerk_user_id = paid_user
      and user_id = paid_user and tier = 'pro' and premium_until = paid_until) then
    raise exception 'paid entitlement or compatibility identity changed';
  end if;
  if has_table_privilege('anon', 'public.subscriptions', 'UPDATE')
      or has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE')
      or has_function_privilege('anon', 'public.increment_free_interaction_count(text)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.increment_free_interaction_count(text)', 'EXECUTE') then
    raise exception 'client roles can mutate subscription state';
  end if;
  if not has_function_privilege('service_role', 'public.increment_free_interaction_count(text)', 'EXECUTE') then
    raise exception 'service role cannot increment';
  end if;
  raise notice 'Subscription repair verification passed; synthetic rows will be rolled back';
end;
$$;
rollback;
