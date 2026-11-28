// scripts/vdi-canary-verify.ts
// Post-trace verification: accounting exact, evidence preserved, and the
// canary credentials enabled ONLY the canary workspace (no other workspace
// gained any VDI rows).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let failures = 0;
const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) failures++; };

async function main() {
  // Accounting
  const b = await admin.from('vdi_budgets').select('limit_micros, accounted_spend_micros, overrun_micros, admission_blocked')
    .eq('tenant_id', 'canary-tenant').eq('workspace_id', 'canary-vdi').single();
  const bd = b.data as Record<string, number | boolean> | null;
  check('budget: $2 limit, 250000 accounted, no overrun, not blocked',
    bd?.limit_micros === 2_000_000 && bd?.accounted_spend_micros === 250_000 && bd?.overrun_micros === 0 && bd?.admission_blocked === false);

  // Reservation evidence preserved (settled, exposure replaced)
  const r = await admin.from('vdi_budget_reservations').select('status, amount_micros, settled_micros, pricing_known, budget_period')
    .eq('tenant_id', 'canary-tenant');
  const rd = (r.data ?? [])[0] as Record<string, unknown> | undefined;
  check('reservation evidence: settled, ceiling exposure 300000, actual 250000, period preserved',
    rd?.status === 'settled' && rd?.amount_micros === 300_000 && rd?.settled_micros === 250_000 && rd?.budget_period === '2026-10');
  check('exactly one reservation row (no duplicates)', (r.data ?? []).length === 1);

  // Desktop row preserved as evidence (phase ready; provider resource destroyed by design)
  const d = await admin.from('vdi_desktops').select('desktop_id, phase, runtime_type')
    .eq('workspace_id', 'canary-vdi');
  check('desktop evidence row preserved', (d.data ?? []).length === 1);

  // SCOPING: no other workspace gained ANY vdi rows from this rollout
  const otherDesktops = await admin.from('vdi_desktops').select('workspace_id').neq('workspace_id', 'canary-vdi');
  check('no non-canary desktops exist', (otherDesktops.data ?? []).length === 0);

  const otherBudgets = await admin.from('vdi_budgets').select('workspace_id').neq('workspace_id', 'canary-vdi');
  check('no non-canary budgets exist (credentials enable only canary)', (otherBudgets.data ?? []).length === 0);

  const otherResv = await admin.from('vdi_budget_reservations').select('workspace_id').neq('workspace_id', 'canary-vdi');
  check('no non-canary reservations exist', (otherResv.data ?? []).length === 0);

  const ops = (await admin.from('vdi_remediation_operations').select('id', { count: 'exact', head: true })).count;
  check('remediation still disabled (0 operations)', ops === 0);

  console.log(failures === 0 ? 'CANARY VERIFY: ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
void main().catch(e => { console.error('VERIFY ERROR:', e.message); process.exit(1); });
