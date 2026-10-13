-- Acquisition tables are backend-only. Run on an isolated test database after
-- applying the A3 schema and its RLS hardening migration. All fixtures, temporary
-- grants, and mutations roll back. Any failed assertion aborts the transaction.
begin;

do $test$
declare
  table_name text;
  client_role text;
  statement text;
  statements text[];
  row_count bigint;
  checks integer := 0;
  request_a uuid := '10000000-0000-4000-8000-000000000001';
  request_b uuid := '10000000-0000-4000-8000-000000000002';
begin
  -- Catalog checks catch missing RLS or client privileges before fixtures exist.
  foreach table_name in array array[
    'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
  ] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', table_name)::regclass) then
      raise exception 'RLS is disabled on public.%', table_name;
    end if;
    checks := checks + 1;
    foreach client_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(client_role, format('public.%I', table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(client_role, format('public.%I', table_name),
          'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception '% retains client privileges on public.%', client_role, table_name;
      end if;
      checks := checks + 1;
    end loop;
  end loop;

  -- Exercise the service-role path used by the webhook and Trigger worker.
  execute 'set local role service_role';
  insert into public.acquisition_requests (id, user_id, request_id, mode)
  values (request_a, 'user_acq_test_a', 'acq-rls-test-a', 'resource'),
         (request_b, 'user_acq_test_b', 'acq-rls-test-b', 'resource');
  get diagnostics row_count = row_count;
  if row_count <> 2 then raise exception 'Backend request insert failed'; end if;
  checks := checks + 1;

  insert into public.acquisition_provider_runs
    (acquisition_request_id, provider, provider_run_id, operation_key, status)
  values (request_a, 'apify', 'acq-rls-run-a', 'acq-rls-operation-a', 'provider_running'),
         (request_b, 'apify', 'acq-rls-run-b', 'acq-rls-operation-b', 'provider_running');
  get diagnostics row_count = row_count;
  if row_count <> 2 then raise exception 'Backend provider insert failed'; end if;
  checks := checks + 1;

  insert into public.acquisition_raw_evidence
    (acquisition_request_id, provider_run_id, ordinal, content_hash, raw_json, provider, retrieved_at)
  values (request_a, 'acq-rls-run-a', 0, 'acq-rls-hash-a', '{"owner":"a"}', 'apify', now()),
         (request_b, 'acq-rls-run-b', 0, 'acq-rls-hash-b', '{"owner":"b"}', 'apify', now());
  get diagnostics row_count = row_count;
  if row_count <> 2 then raise exception 'Backend evidence insert failed'; end if;
  checks := checks + 1;

  foreach table_name in array array[
    'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
  ] loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 2 then raise exception 'Backend cannot read fixtures from %', table_name; end if;
    checks := checks + 1;
  end loop;
  execute 'reset role';

  -- Known IDs and a matching owner claim never permit direct client CRUD.
  foreach client_role in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'user_acq_test_a', 'role', client_role)::text, true);
    execute format('set local role %I', client_role);
    foreach table_name in array array[
      'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
    ] loop
      statements := array[
        format('select * from public.%I', table_name),
        format('insert into public.%I default values', table_name),
        format('update public.%I set created_at = created_at', table_name),
        format('delete from public.%I', table_name),
        format('truncate table public.%I', table_name)
      ];
      foreach statement in array statements loop
        begin
          execute statement;
          raise exception 'Unexpected client access: %: %', client_role, statement;
        exception when insufficient_privilege then
          checks := checks + 1;
        end;
      end loop;
    end loop;
    execute 'reset role';
  end loop;

  -- Independently prove RLS still denies CRUD if table grants return later.
  -- These temporary grants (including PUBLIC) disappear at ROLLBACK.
  grant select, insert, update, delete on table
    public.acquisition_requests, public.acquisition_provider_runs,
    public.acquisition_raw_evidence to public;
  foreach client_role in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'user_acq_test_a', 'role', client_role)::text, true);
    execute format('set local role %I', client_role);
    foreach table_name in array array[
      'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
    ] loop
      execute format('select count(*) from public.%I', table_name) into row_count;
      if row_count <> 0 then raise exception 'RLS leaks rows to % on %', client_role, table_name; end if;
      checks := checks + 1;

      -- Explicit NOT NULL fields ensure an insert cannot fail for an unrelated
      -- constraint instead of proving the RLS WITH CHECK denial.
      statement := case table_name
        when 'acquisition_requests' then
          'insert into public.acquisition_requests (user_id, request_id, mode) values (''user_acq_test_a'', ''acq-rls-forged'', ''resource'')'
        when 'acquisition_provider_runs' then
          format('insert into public.acquisition_provider_runs (acquisition_request_id, provider, provider_run_id) values (%L, ''apify'', ''acq-rls-forged-run'')', request_a)
        else
          format('insert into public.acquisition_raw_evidence (acquisition_request_id, provider_run_id, ordinal, content_hash, raw_json, provider, retrieved_at) values (%L, ''acq-rls-run-a'', 99, ''forged-hash'', ''{}'', ''apify'', now())', request_a)
      end;
      begin
        execute statement;
        raise exception 'RLS permits a forged insert for % on %', client_role, table_name;
      exception when insufficient_privilege then
        checks := checks + 1;
      end;

      execute format('update public.%I set created_at = created_at', table_name);
      get diagnostics row_count = row_count;
      if row_count <> 0 then raise exception 'RLS permits update for % on %', client_role, table_name; end if;
      checks := checks + 1;
      execute format('delete from public.%I', table_name);
      get diagnostics row_count = row_count;
      if row_count <> 0 then raise exception 'RLS permits delete for % on %', client_role, table_name; end if;
      checks := checks + 1;
    end loop;
    execute 'reset role';
  end loop;
  revoke all on table public.acquisition_requests, public.acquisition_provider_runs,
    public.acquisition_raw_evidence from public;

  -- The durable replay locks remain usable by the backend after hardening.
  execute 'set local role service_role';
  update public.acquisition_requests set status = 'running' where id = request_a;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Backend request update failed'; end if;
  checks := checks + 1;

  update public.acquisition_provider_runs set status = 'ingesting'
  where operation_key = 'acq-rls-operation-a'
    and status in ('provider_pending', 'provider_running');
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Backend ingestion claim failed'; end if;
  checks := checks + 1;
  update public.acquisition_provider_runs set status = 'ingesting'
  where operation_key = 'acq-rls-operation-a'
    and status in ('provider_pending', 'provider_running');
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Duplicate ingestion claim succeeded'; end if;
  checks := checks + 1;

  insert into public.acquisition_provider_runs (acquisition_request_id, provider, provider_run_id)
  values (request_a, 'apify', 'acq-rls-run-a')
  on conflict (provider, provider_run_id) do nothing;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Provider retry duplicated a run'; end if;
  checks := checks + 1;

  insert into public.acquisition_raw_evidence
    (acquisition_request_id, provider_run_id, ordinal, content_hash, raw_json, provider, retrieved_at)
  values (request_a, 'acq-rls-run-a', 0, 'acq-rls-hash-a', '{"owner":"a"}', 'apify', now())
  on conflict (provider_run_id, ordinal, content_hash) do nothing;
  get diagnostics row_count = row_count;
  if row_count <> 0 then raise exception 'Evidence retry duplicated a row'; end if;
  checks := checks + 1;

  update public.acquisition_raw_evidence set raw_json = raw_json || '{"verified":true}'::jsonb
  where acquisition_request_id = request_a;
  get diagnostics row_count = row_count;
  if row_count <> 1 then raise exception 'Backend evidence update failed'; end if;
  checks := checks + 1;
  update public.acquisition_provider_runs set status = 'normalizing', record_count = 1
  where operation_key = 'acq-rls-operation-a';
  if not exists (select 1 from public.acquisition_provider_runs
    where operation_key = 'acq-rls-operation-a' and status = 'normalizing' and record_count = 1) then
    raise exception 'Backend ingestion completion failed';
  end if;
  checks := checks + 1;

  foreach table_name in array array[
    'acquisition_raw_evidence', 'acquisition_provider_runs', 'acquisition_requests'
  ] loop
    if table_name = 'acquisition_requests' then
      execute format('delete from public.%I where id = %L', table_name, request_b);
    else
      execute format('delete from public.%I where acquisition_request_id = %L', table_name, request_b);
    end if;
    get diagnostics row_count = row_count;
    if row_count <> 1 then raise exception 'Backend delete failed on %', table_name; end if;
    checks := checks + 1;
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 1 then raise exception 'Fixture was lost or client mutation persisted on %', table_name; end if;
    checks := checks + 1;
  end loop;
  execute 'reset role';
  raise notice 'Acquisition RLS: % assertions passed', checks;
end
$test$;

rollback;
