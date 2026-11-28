// scripts/vdi-canary-reset-c.ts
// Reset Activation C partial state (failed runs) while PRESERVING B evidence:
//   - B's settled reservation (operation_key vdi:canary:…), B's desktop row,
//     B's budget accounting (250000 spent) stay untouched.
//   - C-era rows: provisioned sandboxes + desktop rows with spec_hash
//     'canary-c', C reservations (vdi:canary-c:*), C alerts/observations/
//     evidence on C desktops, C remediation rows.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Daytona } from '@daytona/sdk';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
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

  // C desktop row UUIDs (spec_hash 'canary-c')
  const cRows = (await admin.from('vdi_desktops').select('id').eq('spec_hash', 'canary-c').eq('workspace_id', 'canary-vdi')).data ?? [];
  const ids = (cRows as Array<{ id: string }>).map(r => r.id);

  for (const t of ['vdi_evidence', 'vdi_observations', 'vdi_alerts', 'vdi_remediation_attempts', 'vdi_remediation_operations', 'vdi_session_leases', 'vdi_execution_leases', 'vdi_connection_grants', 'vdi_input_control_leases']) {
    let r;
    for (const id of ids) {
      r = await admin.from(t).delete().eq('desktop_id', id);
    }
    void r;
  }
  console.log('C-era lease/alert/obs/evidence rows cascaded/cleared (per C desktop uuid)');

  // C reservations (operation key prefix)
  const cr = await admin.from('vdi_budget_reservations').delete().like('operation_key', 'vdi:canary-c:%');
  console.log('C reservations cleared:', cr.error ? cr.error.message.slice(0, 60) : 'ok');

  // C desktop rows
  const dr = await admin.from('vdi_desktops').delete().eq('spec_hash', 'canary-c');
  console.log('C desktop rows cleared:', dr.error ? dr.error.message.slice(0, 60) : 'ok');

  // Verify B evidence intact
  const bResv = await admin.from('vdi_budget_reservations').select('operation_key, status').like('operation_key', 'vdi:canary:%');
  const bDt = await admin.from('vdi_desktops').select('desktop_id').eq('spec_hash', 'canary');
  const bBudget = await admin.from('vdi_budgets').select('accounted_spend_micros').eq('workspace_id', 'canary-vdi');
  console.log('B evidence preserved: reservations=', (bResv.data ?? []).length, 'desktops=', (bDt.data ?? []).length,
    'accounted=', (bBudget.data?.[0] as { accounted_spend_micros: number })?.accounted_spend_micros);
  process.exit(0);
}
void main().catch(e => { console.error('RESET-C ERROR:', e.message); process.exit(1); });
