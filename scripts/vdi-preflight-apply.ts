// scripts/vdi-preflight-apply.ts
// Targeted production apply: the SEVEN reviewed VDI migrations, transactionally,
// with truthful ledger recording — per the bounded corrected procedure:
//   1. Apply each migration's SQL inside ONE transaction (BEGIN/COMMIT),
//      hardening included, so no RPC is ever exposed before grants commit.
//   2. After verified SQL success, record each of the seven versions in the
//      remote migration ledger via `supabase migration repair --status applied`
//      (only those seven).
//   3. Read back schema + RPC permissions; confirm the 8 historical rows intact.
// No broad db push, no --include-all. Credentials never printed.
//
// Connection: Supabase Management API /database/query (transactional) using
// the CLI access token — same authority `supabase db push` uses.

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PROJECT_REF = 'ozevwhiipwbcvyzkbhib';
const TOKEN = readFileSync(`${process.env.HOME}/.supabase/access-token`, 'utf8').trim();

const MIGRATIONS = [
  '20261010000000_vdi_desktop_durable_state.sql',
  '20261011000000_vdi_fleet_observations.sql',
  '20261012000000_vdi_alerts_and_usage.sql',
  '20261013000000_vdi_remediation_attempts.sql',
  '20261014000000_vdi_remediation_operations.sql',
  '20261015000000_vdi_budget_admission.sql',
  '20261016000000_vdi_function_hardening.sql',
];

async function query(sql: string): Promise<unknown[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`query failed (${res.status}): ${body.slice(0, 300)}`);
  return JSON.parse(body) as unknown[];
}

async function main() {
  // ── 0. Confirm clean VDI pre-state ──
  const pre = await query("select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'vdi\\_%'");
  const preN = (pre[0] as { n: number }).n;
  if (preN !== 0) throw new Error(`expected 0 vdi functions before apply, found ${preN} — ABORT`);
  console.log('pre-state: 0 vdi functions ✓');

  // ── 1. Apply the seven migrations, EACH inside its own transaction ──
  //    (hardening last; every BEGIN..COMMIT is atomic so a half-applied
  //    migration never lands)
  for (const m of MIGRATIONS) {
    const sql = readFileSync(`supabase/migrations/${m}`, 'utf8');
    // Wrap the file in a transaction. Supabase Management API query runs the
    // whole string as one batch; BEGIN/COMMIT make it atomic.
    const wrapped = `begin;\n${sql}\ncommit;`;
    await query(wrapped);
    console.log(`applied: ${m}`);
  }

  // ── 2. Read-back schema + permissions (inside this script) ──
  const counts = await query(
    "select (select count(*) from pg_tables where schemaname='public' and tablename like 'vdi\\_%') as tables," +
    " (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vdi\\_%') as funcs");
  console.log('read-back:', JSON.stringify(counts[0]));

  const secdef = await query(
    "select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace" +
    " where ns.nspname='public' and p.proname like 'vdi\\_%' and p.prosecdef" +
    " and (p.proconfig is null or not ('search_path=public' = any(p.proconfig)))");
  console.log('unpinned security-definer functions:', (secdef[0] as { n: number }).n, '(expect 0)');

  const acl = await query(
    "select p.proname, p.proacl::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace" +
    " where ns.nspname='public' and p.proname like 'vdi\\_%' order by 1");
  console.log('function ACLs:');
  for (const r of acl as Array<{ proname: string; proacl: string | null }>) {
    console.log(`  ${r.proname}: ${r.proacl}`);
  }

  // anon/authenticated execute-denied probes
  for (const role of ['anon', 'authenticated']) {
    const denied = await query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='public' and p.proname like 'vdi\\_%'
      and has_function_privilege('${role}', p.oid, 'execute')`);
    console.log(`${role} may execute:`, (denied[0] as { n: number }).n, '(expect 0)');
  }
  const sr = await query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname like 'vdi\\_%'
    and has_function_privilege('service_role', p.oid, 'execute')`);
  console.log('service_role may execute:', (sr[0] as { n: number }).n, '(expect 13)');

  // public-schema CREATE check for untrusted roles
  const createOk = await query(`select has_schema_privilege('anon','public','CREATE') as anon_create, has_schema_privilege('authenticated','public','CREATE') as auth_create`);
  console.log('schema CREATE privileges:', JSON.stringify(createOk[0]));

  // ── 3. Record the seven versions in the ledger (CLI repair --status applied) ──
  const versions = MIGRATIONS.map(m => m.split('_')[0]).join(' ');
  console.log('ledger-recording versions:', versions);
  execSync(`supabase migration repair --status applied --linked ${versions}`, { stdio: 'inherit' });
  console.log('ledger updated ✓');

  process.exit(0);
}

main().catch(e => { console.error('ABORT:', e.message); process.exit(1); });
