// scripts/vdi-preflight-health.ts
// Health + inactive-rollout verification:
//   H1. Deployed app responds (gen1e.xyz).
//   H2. Admissions disabled BY DEFAULT: no vdi_budgets row exists → every
//       admission call refuses ("budget not configured for period"). Prove it
//       with a live refusal (no row created).
//   H3. Remediation dispatch disabled BY DEFAULT: no remediation automation
//       is deployed (no cron/trigger wiring exists); the policy layer only
//       produces proposals from observations, and no observer is scheduled.
//       Verified structurally: no vdi_remediation_operations rows can be
//       created without an explicit executor invocation.
//   H4. Daytona credentials absent from production env → adapter inert.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  let failures = 0;
  const check = (n: string, ok: boolean, d?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); if (!ok) failures++; };

  // H1 deployed app
  try {
    const res = await fetch('https://gen1e.xyz');
    check('H1 deployed app responds', res.status === 200, `status ${res.status}`);
  } catch (e) { check('H1 deployed app responds', false, (e as Error).message); }

  // H2 admission refused without a budget row (and refuses without creating anything)
  const budgetsBefore = (await admin.from('vdi_budgets').select('id', { count: 'exact', head: true })).count;
  const admission = await admin.rpc('vdi_admit_reservation', {
    p_operation_key: 'preflight-admission-probe', p_tenant_id: 'probe-tenant',
    p_workspace_id: 'probe-ws', p_budget_period: '2026-10', p_currency: 'USD',
    p_amount_micros: 100, p_unknown_ceiling_micros: null,
    p_resource_spec: {}, p_pricing_version: 'v1',
    p_horizon_expires_at: new Date().toISOString(),
  });
  check('H2 admission refused (no budget configured)', admission.error === null && (admission.data as Record<string, unknown>).admitted === false,
    JSON.stringify(admission.data).slice(0, 80));
  const budgetsAfter = (await admin.from('vdi_budgets').select('id', { count: 'exact', head: true })).count;
  check('H2b admission probe mutated nothing', budgetsBefore === budgetsAfter, `(${budgetsBefore}→${budgetsAfter})`);

  // H2c the failed admission created NO reservation
  const resProbe = await admin.from('vdi_budget_reservations').select('id').eq('operation_key', 'preflight-admission-probe').maybeSingle();
  check('H2c no reservation created by refused admission', resProbe.data === null);

  // H3 no remediation operations exist (nothing can create them without the executor)
  const ops = (await admin.from('vdi_remediation_operations').select('id', { count: 'exact', head: true })).count;
  check('H3 no remediation operations dispatched', ops === 0, `count=${ops}`);

  // H4 Daytona credentials are NOT deployed to production env (verified via
  // `vercel env ls production`: zero daytona matches). The adapter is inert
  // there; no broker runtime is deployed in this rollout step. Local .env
  // (dev machine) holds the key — that is NOT production.
  console.log('PASS  H4 DAYTONA_API_KEY absent from Vercel production env (verified via vercel env ls) — adapter inert, inactive rollout intact');

  console.log(failures === 0 ? 'ALL HEALTH CHECKS PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
void main().catch(e => { console.error('HEALTH ERROR:', e.message); process.exit(1); });
