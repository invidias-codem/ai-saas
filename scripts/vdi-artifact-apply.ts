// scripts/vdi-artifact-apply.ts
// Apply the VDI-6 migration transactionally + record ledger + verify hardening.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PROJECT_REF = 'ozevwhiipwbcvyzkbhib';
const TOKEN = readFileSync(`${process.env.HOME}/.supabase/access-token`, 'utf8').trim();

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
  const sql = readFileSync('supabase/migrations/20261018000000_vdi_artifact_grants.sql', 'utf8');
  await query(`begin;\n${sql}\ncommit;`);
  console.log('applied 20261018000000 transactionally (tables + RPCs + hardening in ONE commit)');

  // Verify: tables, RPCs, hardening — all inside this script.
  const t = await query("select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'vdi_artifact%'");
  console.log('vdi_artifact tables:', (t[0] as { n: number }).n, '(expect 2)');

  const f = await query("select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'vdi_%'");
  console.log('total vdi_* RPCs:', (f[0] as { n: number }).n, '(expect 16: 13 + grant/retrieve/revoke)');

  for (const role of ['anon', 'authenticated']) {
    const d = await query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='public' and p.proname like 'vdi_%' and has_function_privilege('${role}', p.oid, 'execute')`);
    console.log(`${role} may execute:`, (d[0] as { n: number }).n, '(expect 0)');
  }
  const sr = await query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname like 'vdi_%' and has_function_privilege('service_role', p.oid, 'execute')`);
  console.log('service_role may execute:', (sr[0] as { n: number }).n, '(expect 16)');

  execSync('supabase migration repair --status applied --linked 20261018000000', { stdio: 'inherit' });
  console.log('ledger recorded');
}
void main().catch(e => { console.error('ABORT:', e.message); process.exit(1); });
