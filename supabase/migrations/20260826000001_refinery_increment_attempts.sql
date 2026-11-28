-- Increment attempts counter for refinery jobs
create or replace function increment_refinery_job_attempts(p_ids bigint[])
returns void
language plpgsql
as $$
begin
  update workspace_refinery_jobs
  set attempts = coalesce(attempts, 0) + 1
  where id = any(p_ids);
end;
$$;
