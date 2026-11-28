#!/usr/bin/env bash
# Validate the Phase 3 code_builder_builds migration against a DISPOSABLE Postgres.
#
# Proves (in isolation, never touching MAIN):
#   - migration applies cleanly to a fresh schema
#   - structural contract (columns/PK/enums/index/RLS/policies/grants)
#   - RLS matrix (user-scoped reads, anon blocked, authenticated write-denied,
#     service-role write-allowed)
#   - state-transition + race + idempotency semantics
#
# Usage: bash scripts/validate-code-builder.sh
# Requires: docker (daemon running). Spins up a throwaway postgres:15 on :55432.

set -euo pipefail

CONTAINER="cb_pg_val"
MIGRATION="supabase/migrations/20260913000000_code_builder_builds.sql"

echo "==> ensuring disposable Postgres"
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "    container already running"
else
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=val -e POSTGRES_DB=cbval -p 55432:5432 postgres:15 >/dev/null
  echo "    waiting for readiness..."
  until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
fi

run_psql() { docker exec -i "$CONTAINER" psql -U postgres -d cbval -v ON_ERROR_STOP=1 "$@"; }

echo "==> resetting schema + applying auth stub + migration"
docker exec "$CONTAINER" psql -U postgres -d cbval -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA auth CASCADE;" >/dev/null 2>&1 || true
run_psql -f /dev/stdin < scripts/validate-auth-stub.sql >/dev/null
run_psql -f /dev/stdin < "$MIGRATION" >/dev/null

echo "==> structural assertions"
run_psql -f /dev/stdin < scripts/validate-code-builder-schema.sql

echo "==> RLS + transition + race assertions"
run_psql -f /dev/stdin < scripts/validate-code-builder-rls.sql

echo ""
echo "ALL CODE-BUILDER MIGRATION VALIDATIONS PASSED"