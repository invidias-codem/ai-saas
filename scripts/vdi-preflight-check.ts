// scripts/vdi-preflight-check.ts
// Read-only production preflight: verify remote state WITHOUT applying anything.
// No secrets printed. Uses SUPABASE_SERVICE_ROLE_KEY from env files (server-side only).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('== project ==');
  console.log(url.replace(/https:\/\//, '').split('.')[0]);

  console.log('== vdi objects in production ==');
  const { data: procs, error: e1 } = await admin
    .from('pg_catalog')
    .select()
    .limit(0); // pg_catalog isn't exposed via PostgREST — expect an error; fall through
  void procs; void e1;

  // RPC probe instead: a harmless existing vdi function signature check via
  // information_schema (service_role can read it via PostgREST? No — only
  // exposed tables. Use an RPC we know: none yet. So probe tables directly.)
  const { count: obsCount } = await admin.from('vdi_observations').select('*', { count: 'exact', head: true });
  console.log('vdi_observations reachable:', obsCount !== null ? 'YES' : 'unknown');

  // remote ledger state (supabase_migrations.schema_version is in private schema; not PostgREST-exposed)
  console.log('== ledger via CLI only; this script checks objects ==');
  const tables = ['vdi_desktops','vdi_session_leases','vdi_execution_leases','vdi_connection_grants','vdi_input_control_leases','vdi_operation_keys','vdi_evidence','vdi_observations','vdi_alerts','vdi_usage_records','vdi_remediation_attempts','vdi_remediation_operations','vdi_budgets','vdi_budget_reservations'];
  for (const t of tables) {
    const { error } = await admin.from(t).select('id').limit(1);
    console.log(`  ${t}: ${error ? 'ABSENT' : 'present'}`);
  }
  process.exit(0);
}
void main();
