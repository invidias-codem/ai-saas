// scripts/vdi-canary-fix-apply.ts
// Apply the observation column-fix migration transactionally + record ledger.
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PROJECT_REF = 'ozevwhiipwbcvyzkbhib';
const TOKEN = readFileSync(`${process.env.HOME}/.supabase/access-token`, 'utf8').trim();

async function main() {
  const sql = readFileSync('supabase/migrations/20261017000000_vdi_observations_checked_at.sql', 'utf8');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`apply failed (${res.status}): ${body.slice(0, 300)}`);
  console.log('applied 20261017000000 transactionally');

  // Verify column exists
  const v = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "select column_name from information_schema.columns where table_name='vdi_observations' and column_name='checked_at'" }),
  });
  const cols = JSON.parse(await v.text()) as unknown[];
  console.log('checked_at column present:', cols.length === 1);

  execSync('supabase migration repair --status applied --linked 20261017000000', { stdio: 'inherit' });
  console.log('ledger recorded');
}
void main().catch(e => { console.error('ABORT:', e.message); process.exit(1); });
