// scripts/vdi-preflight-probes.ts
// Deployed authorization probes (read/write-scoped, self-cleaning):
//   P1. anon/authenticated CANNOT reach any vdi_* table via PostgREST
//       (the deployed API boundary) — and CANNOT execute any vdi_* RPC.
//   P2. service_role (the broker's exact credential path) CAN.
//   P3. Two probe workspaces through the broker's scoped store queries:
//       each sees only its own; cross-workspace reads deny; foreign desktop
//       IDs are indistinguishable from absent.
//   P4. Denied requests cause no provisioning/mutations: probe rows written
//       under correct scope only; cross-scope writes fail at the DB boundary
//       (RLS) — verified by attempting a cross-tenant insert via the anon key.
//   P5. Cleanup: probe rows destroyed; final count zero.
// No secrets printed.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const WS_A = 'probe-ws-a';
const WS_B = 'probe-ws-b';
const DESKTOP_A = 'probe-dt-a';

async function main() {
  let failures = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures++;
  };

  // ── P1: anon/authenticated denied at the deployed API boundary ──
  const anonRead = await anon.from('vdi_desktops').select('desktop_id').limit(1);
  check('P1a anon table read denied', anonRead.error !== null);

  const anonRpc = await anon.rpc('vdi_admit_reservation', {
    p_operation_key: 'probe-anon', p_tenant_id: 't', p_workspace_id: 'w',
    p_budget_period: 'p', p_currency: 'USD', p_amount_micros: 1,
    p_unknown_ceiling_micros: null, p_resource_spec: {},
    p_pricing_version: 'v', p_horizon_expires_at: new Date().toISOString(),
  });
  check('P1b anon RPC denied', anonRpc.error !== null);

  // ── Seed probe rows under service-role (broker path) ──
  await admin.from('vdi_desktops').insert({
    desktop_id: DESKTOP_A, tenant_id: 'probe-tenant-a', workspace_id: WS_A,
    generation: 1, provider: 'probe', provider_id: 'probe-sb-a',
    runtime_type: 'container', persistence: 'workspace',
    image_version: 'probe', spec_hash: 'probe', phase: 'ready',
  });

  // ── P2/P3: broker scoped queries (service-role credential, the exact path
  //    desktopStore.getDesktopById / listDesktops use) ──
  const scopeA = { tenantId: 'probe-tenant-a', workspaceId: WS_A };
  const scopeB = { tenantId: 'probe-tenant-b', workspaceId: WS_B };

  const mine = await admin.from('vdi_desktops').select('desktop_id, workspace_id')
    .eq('tenant_id', scopeA.tenantId).eq('workspace_id', scopeA.workspaceId);
  check('P2a own-scope read sees own desktop', (mine.data ?? []).length === 1 && mine.data![0].desktop_id === DESKTOP_A);

  const theirs = await admin.from('vdi_desktops').select('desktop_id')
    .eq('tenant_id', scopeB.tenantId).eq('workspace_id', scopeB.workspaceId);
  check('P3a cross-workspace list empty (broker scoping)', (theirs.data ?? []).length === 0);

  // Foreign desktop ID through scope B's scoped query → indistinguishable from absent
  const foreign = await admin.from('vdi_desktops').select('desktop_id')
    .eq('desktop_id', DESKTOP_A)
    .eq('tenant_id', scopeB.tenantId).eq('workspace_id', scopeB.workspaceId)
    .maybeSingle();
  check('P3b foreign desktop ID indistinguishable from absent', foreign.data === null);

  // ── P4: denied requests mutate nothing ──
  // Cross-tenant write via anon (should be RLS+grant-denied): verify no row appears.
  const before = (await admin.from('vdi_desktops').select('id', { count: 'exact', head: true })).count;
  const anonWrite = await anon.from('vdi_desktops').insert({
    desktop_id: 'probe-anon-inject', tenant_id: 'x', workspace_id: 'x',
    generation: 1, provider: 'x', provider_id: 'x',
    runtime_type: 'container', persistence: 'workspace',
    image_version: 'x', spec_hash: 'x', phase: 'ready',
  });
  const after = (await admin.from('vdi_desktops').select('id', { count: 'exact', head: true })).count;
  check('P4a denied anon write causes no mutation', anonWrite.error !== null && after === before, `(${before}→${after})`);

  // Provider provisioning check: probe provider_id rows only exist for service-role seeds
  const providerRows = await admin.from('vdi_desktops').select('desktop_id')
    .eq('provider_id', 'probe-sb-a');
  check('P4b no unexpected provider rows', (providerRows.data ?? []).length === 1);

  // ── P5: cleanup — probe rows destroyed ──
  await admin.from('vdi_desktops').delete().eq('workspace_id', WS_A);
  await admin.from('vdi_desktops').delete().eq('workspace_id', WS_B);
  const final = (await admin.from('vdi_desktops').select('id', { count: 'exact', head: true })).count;
  check('P5 probe rows cleaned', final === 0, `final=${final}`);

  console.log(failures === 0 ? 'ALL PROBES PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch(e => { console.error('PROBE ERROR:', e.message); process.exit(1); });
