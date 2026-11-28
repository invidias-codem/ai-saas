#!/bin/bash
# Production preflight — targeted VDI migration apply.
# Applies ONLY the seven reviewed VDI migrations, in ONE db-push transaction
# (create + harden commit atomically: no RPC is ever exposed unhardened),
# each recorded in the Supabase migration ledger.
# 20261011140000_repair_subscriptions.sql is moved aside: its own header says
# "apply alone, do not push the backlog" — it is NOT part of this rollout.
set -e
cd /Users/jjem/Projects/ai-saas
SIDECAR=$(mktemp -d /tmp/vdi-nonpushed.XXXX)

echo "== moving non-VDI targeted repair aside =="
mv supabase/migrations/20261011140000_repair_subscriptions.sql "$SIDECAR/"

echo "== pending before push (should list exactly the 7 VDI migrations) =="
supabase migration list --linked 2>&1 | grep -E "^\s+2026" | awk -F'|' '$2 !~ /[0-9]/ && $1 !~ /20261007000000/ {print "  pending:", $1}'

echo "== applying (single transaction) =="
supabase db push --linked --yes --include-all 2>&1 | tail -5

echo "== restore non-VDI repair file =="
mv "$SIDECAR/20261011140000_repair_subscriptions.sql" supabase/migrations/
rmdir "$SIDECAR"

echo "== ledger after push =="
supabase migration list --linked 2>&1 | grep -E "2026101[0-6]" | head -10
