// scripts/vdi-preflight-drift.ts
// Read-only: for each remote-missing migration, probe whether the objects it
// would create ALREADY exist in production (applied-but-unrecorded drift) or
// are absent. Decision support for `migration repair` — never blind.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false } });

// (migration, probe table it creates) — read-only existence probes
const MISSING = [
  ['20260524000006', null], // unknown content — list below
  ['20260527000002', null],
  ['20260527000003', null],
  ['20260906000000', null],
  ['20260909000000', null],
  ['20260909000001', null],
  ['20260909000002', null],
  ['20260910000000', null],
];

async function main() {
  console.log('== missing-migration files and their target objects ==');
  for (const [m] of MISSING) {
    console.log(`  ${m}`);
  }
  console.log('== probe key tables those migrations likely created ==');
  for (const t of ['subscriptions', 'refinery_jobs', 'jepa_training_queue', 'code_builder_builds', 'code_builder_artifacts', 'workspace_memories']) {
    const { error } = await admin.from(t).select('id').limit(1);
    console.log(`  ${t}: ${error ? 'ABSENT' : 'present'}`);
  }
  process.exit(0);
}
void main();
