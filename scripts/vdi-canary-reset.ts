// scripts/vdi-canary-reset.ts
// Reset canary state after the failed first run: destroy any leftover provider
// desktops (canary labels), remove all canary durable rows EXCEPT nothing —
// the first run produced no evidence worth keeping (it failed mid-trace).
// Second run must start from a clean, honest baseline.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Daytona } from '@daytona/sdk';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  // Provider cleanup: list canary-labeled sandboxes and destroy them
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY!,
    apiUrl: process.env.DAYTONA_API_URL ?? 'https://app.daytona.io/api',
    target: process.env.DAYTONA_TARGET ?? 'us',
  });
  let destroyed = 0;
  for await (const sb of daytona.list({ labels: { 'lattice-workspace': 'canary-vdi' } })) {
    await sb.delete(60, true).catch(() => {});
    destroyed++;
  }
  console.log('provider sandboxes destroyed:', destroyed);

  // Durable rows: delete ALL canary rows (failed-run state, not evidence)
  const tables = [
    'vdi_connection_grants', 'vdi_session_leases', 'vdi_execution_leases',
    'vdi_input_control_leases', 'vdi_observations', 'vdi_alerts',
    'vdi_usage_records', 'vdi_remediation_attempts', 'vdi_remediation_operations',
    'vdi_budget_reservations', 'vdi_desktops',
  ];
  for (const t of tables) {
    const r = await admin.from(t).delete().eq('workspace_id', 'canary-vdi');
    console.log(`  ${t}: ${r.error ? 'ERROR ' + r.error.message : 'cleared'}`);
  }
  // Budget row (keyed by tenant/workspace/period, not workspace_id column only)
  const b = await admin.from('vdi_budgets').delete().eq('workspace_id', 'canary-vdi');
  console.log('  vdi_budgets:', b.error ? 'ERROR ' + b.error.message : 'cleared');

  // Verify clean
  const cnt = (await admin.from('vdi_desktops').select('id', { count: 'exact', head: true }).eq('workspace_id', 'canary-vdi')).count;
  console.log('canary desktops remaining:', cnt);
  process.exit(0);
}
void main().catch(e => { console.error('RESET ERROR:', e.message); process.exit(1); });
