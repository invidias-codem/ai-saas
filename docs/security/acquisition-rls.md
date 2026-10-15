# Acquisition table access

`acquisition_requests`, `acquisition_provider_runs`, and `acquisition_raw_evidence`
are internal durable state. The Apify webhook and Trigger.dev task use
`lib/acquisition/store/acquisitionStore.ts`, which uses `supabaseAdmin` with the
server-only service-role key. No direct browser/client access is intended.

The original A3 migration (`20261007000000`) created these tables without RLS.
The forward migration `20261018000000_acquisition_rls.sql` enables RLS, removes
PUBLIC/anon/authenticated table and column privileges, and preserves backend
CRUD with explicit service-role policies. No acquisition data is removed.

## Targeted production application

1. Confirm the target is the application's main Supabase project and the backend
   uses a genuine service-role/secret key. Review this exact migration.
2. Execute **only** `supabase/migrations/20261018000000_acquisition_rls.sql` in that
   project's SQL Editor, or use an admin connection:

   ```sh
   psql "$ACQUISITION_DB_URL" -v ON_ERROR_STOP=1 \
     -f supabase/migrations/20261018000000_acquisition_rls.sql
   ```

   The file is atomic and has a five-second lock timeout. A lock timeout rolls
   back the transaction; retry after the conflicting transaction finishes.
   Reapplying the exact file is safe. Do not use a broad `db push` or `migration up`
   to deploy this fix while unrelated migration-ledger drift remains unresolved.

3. Verify all three rows show `rls_enabled = true`, `client_table_access = false`,
   `client_column_access = false`, and `backend_crud = true`:

   ```sql
   select c.relname as table_name, c.relrowsecurity as rls_enabled,
     (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
       as client_table_access,
     (has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
       as client_column_access,
     (has_table_privilege('service_role', c.oid, 'SELECT')
       and has_table_privilege('service_role', c.oid, 'INSERT')
       and has_table_privilege('service_role', c.oid, 'UPDATE')
       and has_table_privilege('service_role', c.oid, 'DELETE')) as backend_crud
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (
     'acquisition_requests', 'acquisition_provider_runs', 'acquisition_raw_evidence'
   ) order by c.relname;
   ```

   If a client-access field is still true, investigate inherited role privileges
   before considering the fix complete. Inspect `pg_policies` for these tables;
   the checked-in access contract contains only service-role policies.

4. After successful application and readback, record only this version in the
   linked project's migration ledger if the SQL Editor/psql route was used:

   ```sh
   supabase migration repair --status applied 20261018000000 --linked
   ```

   This records application; it does not execute other pending migrations.
5. Refresh Supabase's Security Advisor and verify the three reported errors clear.
   Confirm an existing backend acquisition can still read its persisted state.

## Regression verification

`.github/workflows/acquisition-rls.yml` provisions an isolated PostgreSQL 15
database, proves the original schema fails, applies the fix twice, and runs
`supabase/tests/acquisition_rls.sql`. The SQL exercises 82 assertions per run:
RLS flags and grants; client CRUD/TRUNCATE denial with a matching owner claim;
RLS denial even when PUBLIC CRUD grants are temporarily restored; backend CRUD;
ingestion-claim uniqueness; provider/evidence retry deduplication; and successful
ingestion completion. It repeats with service-role BYPASSRLS disabled to verify
the explicit policies. All fixtures and temporary grants roll back.

This standalone test requires only the two acquisition migrations and the three
Supabase API roles. It is intended for an empty, isolated test database, not
production. It needs no production keys and adds no application dependency.

## Recovery

If backend requests fail after application, verify the service-role key and
role-specific grants. Restore the required **backend** access and keep client
access denied. Do not disable RLS or restore client grants as a recovery step.
