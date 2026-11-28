#!/bin/bash
# Production preflight — step 0: connectivity + pre-state (NO secrets printed).
# Credentials sourced from .env.vercel.production directly into PGPASSWORD;
# nothing secret is echoed into logs or evidence.
set -e
cd /Users/jjem/Projects/ai-saas
export PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD' .env.vercel.production | cut -d= -f2 || true)"
if [ -z "$PGPASSWORD" ]; then
  # Fall back to the service-role key if no DB password var exists
  export PGPASSWORD="$(grep '^SUPABASE_SERVICE_ROLE_KEY' .env.vercel.production | cut -d= -f2)"
fi
DB="postgres://postgres.ozevwhiipwbcvyzkbhib@aws-0-us-west-2.pooler.supabase.com:6543/postgres"
echo "== connectivity =="
psql "$DB" -tAc "select current_database(), current_user;" | head -1
echo "== existing vdi objects (expect 0 before preflight) =="
psql "$DB" -tAc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vdi_%';"
psql "$DB" -tAc "select count(*) from pg_tables where schemaname='public' and tablename like 'vdi_%';"
echo "== migration ledger: existing supabase_migrations.schema_version VDI entries (expect 0) =="
psql "$DB" -tAc "select count(*) from supabase_migrations.schema_version where version like '2026101%';" 2>/dev/null || echo "ledger table check failed"
echo "== auth schema roles present =="
psql "$DB" -tAc "select rolname from pg_roles where rolname in ('anon','authenticated','service_role') order by 1;"
