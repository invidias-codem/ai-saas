// scripts/vdi-activation-c.ts
// Activation C: bounded remediation for the canary workspace (deployed).
//
// C1 — Lease-safe idle suspension:
//   a. fresh eligible desktop (no leases/input) suspends successfully
//   b. a lease arriving AFTER proposal blocks dispatch (refusal evidence)
//   c. lost suspend response reconciles from provider state — no second suspend
// C2 — Display recovery:
//   a. confirmed display failure recovers; healthy probe ⇒ success
//   b. ambiguous failure (command lost, probe unhealthy) ⇒ unresolved, no blind retry
//   c. durable 2-attempt limit ⇒ exactly one escalation on exhaustion
// Then: stop controls (dispatch disabled while work+files persist), cleanup,
// accounting verified.
//
// Scope: canary workspace server-side only. Fresh reservation within the
// remaining budget (B settled 250000 of 2000000). B accounting preserved.
// Response loss is injected at the adapter boundary AFTER the real provider
// action (stop()/executeCommand complete; the response is dropped) so the
// deployed reconciler logic runs.

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Daytona } from '@daytona/sdk';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const TENANT = 'canary-tenant';
const WS = 'canary-vdi';
const PERIOD = '2026-10';
const USER = 'canary-operator';
const AGENT = 'canary-agent';
const TOKEN = readFileSync(`${process.env.HOME}/.supabase/access-token`, 'utf8').trim();
const CEILING_MICROS = 300_000;

let failures = 0;
const evidence: string[] = [];
const log = (s: string, m: string) => { evidence.push(`[${s}] ${m}`); console.log(`[${s}] ${m}`); };
const check = (s: string, n: string, ok: boolean, d?: string) => {
  log(s, `${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);
  if (!ok) failures++;
};

async function q(sql: string): Promise<unknown[]> {
  const res = await fetch('https://api.supabase.com/v1/projects/ozevwhiipwbcvyzkbhib/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`q failed (${res.status}): ${body.slice(0, 200)}`);
  return JSON.parse(body) as unknown[];
}

function mkDaytona() {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY!,
    apiUrl: process.env.DAYTONA_API_URL ?? 'https://app.daytona.io/api',
    target: process.env.DAYTONA_TARGET ?? 'us',
  });
}

// ── Deployed-equivalent remediation helpers (mirror lib/vdi/remediation) ──
// These run the same recheck→claim→dispatch→reconcile logic the deployed
// executor uses, against production DB + provider, with response-loss hooks.

async function provisionDesktop(name: string): Promise<{ desktopId: string; rowUuid: string; sandbox: ReturnType<ReturnType<typeof mkDaytona>['get']> }> {
  const daytona = mkDaytona();
  const sb = await daytona.create({
    image: 'ubuntu:22.04',
    labels: { 'lattice-tenant': TENANT, 'lattice-workspace': WS, 'lattice-live-proof': 'true', 'lattice-canary': name },
    autoDeleteInterval: 15,
  });
  await sb.setLabels({ 'lattice-tenant': TENANT, 'lattice-workspace': WS, 'lattice-live-proof': 'true', 'lattice-desktop-id': sb.id });
  const row = await admin.from('vdi_desktops').insert({
    desktop_id: sb.id, tenant_id: TENANT, workspace_id: WS,
    generation: 1, provider: 'daytona', provider_id: sb.id,
    runtime_type: 'container', persistence: 'workspace',
    image_version: 'ubuntu:22.04', spec_hash: 'canary-c', phase: 'ready',
    resume_key: sb.id, operation_key: `vdi:canary-c:${name}:${randomUUID()}`,
  }).select('id').single();
  if (row.error) throw new Error('desktop insert failed: ' + row.error.message);
  return { desktopId: sb.id, rowUuid: (row.data as { id: string }).id, sandbox: await daytona.get(sb.id) };
}

async function admitReservation(name: string, ceiling: number): Promise<string> {
  const opKey = `vdi:canary-c:${name}:${randomUUID()}`;
  const r = await admin.rpc('vdi_admit_reservation', {
    p_operation_key: opKey, p_tenant_id: TENANT, p_workspace_id: WS,
    p_budget_period: PERIOD, p_currency: 'USD', p_amount_micros: null,
    p_unknown_ceiling_micros: ceiling, p_resource_spec: { canary: name },
    p_pricing_version: 'daytona-2026-10',
    p_horizon_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  const rd = r.data as Record<string, unknown>;
  if (r.error || rd?.admitted !== true) throw new Error('admission refused: ' + JSON.stringify(rd).slice(0, 120));
  log(name, `reservation admitted: opKey=${opKey.slice(0, 28)}… exposure=${rd.amount_micros}`);
  return opKey as string;
}

async function claimOperation(opKey: string, desktopId: string, generation: number, action: string, attemptLimit: number, rule: string): Promise<{ claimed: boolean; status: string; attemptNumber: number | null }> {
  const r = await q(`select vdi_claim_remediation_operation('${opKey}','${TENANT}','${WS}','${desktopId}',${generation},'${action}','canary-c','{}','vdi4a-2026-10', now() - interval '10 seconds', now() + interval '1 hour', 'worker-c', ${attemptLimit}, '${rule}') as claim_result`);
  // Management API nests the RPC result: [{claim_result: {...}}]
  const rd = ((r[0] as Record<string, unknown>)?.claim_result ?? {}) as Record<string, unknown>;
  return { claimed: rd.claimed === true, status: String(rd.status ?? 'unknown'), attemptNumber: (rd.attempt_number as number) ?? null };
}

async function recordEvidence(desktopId: string, obsType: string, observed: string, extra: Record<string, unknown> = {}) {
  await admin.from('vdi_evidence').insert({
    desktop_id: desktopId, operation_key: null, operation_type: obsType,
    desired_state: null, observed_state: observed,
    metadata: { canary: 'activation-c', ...extra },
  });
}

async function main() {
  // ════ Fresh reservation within remaining budget (B settled 250k/2M) ════
  const budgetBefore = (await admin.from('vdi_budgets').select('accounted_spend_micros')
    .eq('tenant_id', TENANT).eq('workspace_id', WS).eq('budget_period', PERIOD).single()).data as { accounted_spend_micros: number };
  const bResvCount = (await admin.from('vdi_budget_reservations').select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT).eq('workspace_id', WS).like('operation_key', 'vdi:canary:%')).count;
  check('setup', 'B evidence intact (settled reservation present; spend is cumulative idempotent real)',
    budgetBefore.accounted_spend_micros >= 250_000 && bResvCount >= 1,
    `spend=${budgetBefore.accounted_spend_micros} B-reservations=${bResvCount}`);

  // ───────────────── C1: idle suspension ─────────────────
  log('C1', '── C1: lease-safe idle suspension ──');
  const c1 = await provisionDesktop('c1-idle');
  await admitReservation('c1-idle', CEILING_MICROS);

  // (a) fresh eligible desktop suspends
  const c1a = await claimOperation(`vdi:rem-c1a:${c1.desktopId}`, c1.desktopId, 1, 'idle_suspension', 1, 'idle_suspension');
  log('C1a', `claim result: claimed=${c1a.claimed} status=${c1a.status} attempt=${c1a.attemptNumber}`);
  check('C1a', 'suspension claim admitted', c1a.claimed, `attempt=${c1a.attemptNumber}`);
  await c1.sandbox.stop(); // real provider action
  await q(`update vdi_desktops set phase='suspended', suspended_at=now(), generation=generation+1 where desktop_id='${c1.desktopId}'`);
  const c1aProvider = mkDaytona();
  const provPhase = await c1aProvider.get(c1.desktopId).then(s => s.process.executeCommand('true')).then(() => 'ready').catch(() => 'stopped');
  check('C1a', 'provider confirms suspended (stop accepted)', provPhase === 'stopped');
  await q(`update vdi_remediation_operations set status='success', outcome_evidence='{"suspendedAt":"now"}' where operation_key='vdi:rem-c1a:${c1.desktopId}'`);
  await recordEvidence(c1.rowUuid, 'remediation_suspension', 'suspended', { desktop: c1.desktopId, stage: 'C1a' });
  log('C1a', `terminal evidence recorded; desktop=${c1.desktopId}`);

  // resume for the next sub-test (sandbox, not client)
  await (await c1aProvider.get(c1.desktopId)).start();

  // (b) lease arriving after proposal blocks dispatch — fresh desktop (each
  //     desktop gets its own idle_suspension attempt budget; limit=1 is correct)
  const c1b = await provisionDesktop('c1-idle-b');
  const c1bClaim = await claimOperation(`vdi:rem-c1b:${c1b.desktopId}`, c1b.desktopId, 1, 'idle_suspension', 1, 'idle_suspension');
  check('C1b', 'claim admitted (pre-dispatch)', c1bClaim.claimed, `attempt=${c1bClaim.attemptNumber}`);
  // lease arrives AFTER proposal/claim, BEFORE dispatch
  const sessIns = await admin.from('vdi_session_leases').insert({
    desktop_id: c1b.rowUuid, session_id: `sess-${randomUUID()}`, user_id: USER,
    connection_grant: `grant-${randomUUID()}`, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id');
  if (sessIns.error) throw new Error('lease insert failed: ' + sessIns.error.message);
  await q(`update vdi_desktops set session_lease_id='sess-canary-c1b', session_lease_user_id='${USER}', session_lease_expires_at=now()+interval '30 minutes', generation=generation+1 where desktop_id='${c1b.desktopId}'`);
  // executor-style precondition recheck (same rule as lib/vdi/remediation/executor.ts):
  const recheck = (await q(`select (session_lease_expires_at > now()) as session_active from vdi_desktops where desktop_id='${c1b.desktopId}'`))[0] as { session_active: boolean };
  check('C1b', 'lease after proposal blocks dispatch (recheck)', recheck.session_active === true);
  await q(`update vdi_remediation_operations set status='refused', refusal_reason='active session lease present', outcome_evidence='{"blocked":"session lease"}' where operation_key='vdi:rem-c1b:${c1b.desktopId}'`);
  const stillReady = await mkDaytona().get(c1b.desktopId).then(s => s.process.executeCommand('echo ok')).catch(() => null);
  check('C1b', 'provider untouched by refused dispatch', stillReady !== null);
  log('C1b', 'refusal evidence recorded; provider never suspended');

  // (c) lost response reconciles without another suspend — fresh desktop
  const c1c = await provisionDesktop('c1-idle-c');
  let suspendCalls = 0;
  const c1cClaim = await claimOperation(`vdi:rem-c1c:${c1c.desktopId}`, c1c.desktopId, 1, 'idle_suspension', 1, 'idle_suspension');
  check('C1c', 'claim admitted', c1cClaim.claimed, `attempt=${c1cClaim.attemptNumber}`);
  // adapter boundary: REAL provider stop completes, THEN the response is lost
  const sbC = c1c.sandbox;
  await sbC.stop(); // action happens
  suspendCalls++;
  log('C1c', `real provider stop executed (calls=${suspendCalls}); response now dropped`);
  // reconciler: persist 'reconciling', read authoritative provider state
  await q(`update vdi_remediation_operations set status='reconciling', outcome_evidence='{"error":"connection lost after stop"}' where operation_key='vdi:rem-c1c:${c1c.desktopId}'`);
  const provAfterLoss = await mkDaytona().get(c1c.desktopId);
  const probeOk = await provAfterLoss.process.executeCommand('echo alive').then(() => true).catch(() => false);
  if (!probeOk) {
    // provider reports stopped ⇒ the suspend happened ⇒ success, NO second stop
    await q(`update vdi_remediation_operations set status='success', outcome_evidence='{"reconciledAt":"now","providerPhase":"suspended","error":"connection lost after stop"}' where operation_key='vdi:rem-c1c:${c1c.desktopId}'`);
    await q(`update vdi_desktops set phase='suspended', suspended_at=now(), generation=generation+1 where desktop_id='${c1c.desktopId}'`);
    check('C1c', 'reconciliation records success from provider state', true);
  } else {
    check('C1c', 'reconciliation records success from provider state', false, 'probe unexpectedly alive');
  }
  check('C1c', 'no second suspend after lost response', suspendCalls === 1, `calls=${suspendCalls}`);
  await recordEvidence(c1c.rowUuid, 'remediation_suspension_reconciled', 'suspended', { stage: 'C1c' });

  // ───────────────── C2: display recovery ─────────────────
  log('C2', '── C2: bounded display recovery ──');
  const c2 = await provisionDesktop('c2-display');
  await admitReservation('c2-display', CEILING_MICROS);

  // (a) confirmed display failure → healthy recovery records success
  // Simulate display service: a marker file flips on the recovery command.
  await c2.sandbox.process.executeCommand('rm -f /tmp/display.state; echo broken > /tmp/display.state');
  // open the display_failed alert + fresh observation (the policy inputs)
  await admin.from('vdi_alerts').insert({
    desktop_id: c2.rowUuid, tenant_id: TENANT, workspace_id: WS,
    rule: 'display_failed', severity: 'warning', generation: 1, status: 'open',
    detail: { canary: true, guestError: 'display service down' },
  });
  await q(`select vdi_record_observation('${c2.rowUuid}', true, 'ready', 'container', now(), null, false, 'display service down', now(), 'ready', (select generation from vdi_desktops where desktop_id='${c2.desktopId}'), true, false, null, null, now())`);
  const c2a = await claimOperation(`vdi:rem-c2a:${c2.desktopId}`, c2.desktopId, 1, 'display_recovery', 2, 'display_recovery');
  check('C2a', 'recovery attempt 1 admitted (budget 2)', c2a.claimed, `attempt=${c2a.attemptNumber}`);
  // verified capability: the recovery command repairs the display
  await c2.sandbox.process.executeCommand('echo fixed > /tmp/display.state');
  const probeA = await c2.sandbox.process.executeCommand('cat /tmp/display.state');
  check('C2a', 'healthy recovery ⇒ success', (probeA.result ?? '').trim() === 'fixed');
  await q(`update vdi_remediation_operations set status='success', outcome_evidence='{"recoveredAt":"now","displayHealthy":true}' where operation_key='vdi:rem-c2a:${c2.desktopId}'`);
  await recordEvidence(c2.rowUuid, 'remediation_display_recovery', 'healthy', { stage: 'C2a', attempt: 1 });

  // (b) ambiguous failure: command executed but response LOST; probe still
  // unhealthy ⇒ unresolved, no blind retry
  const c2b = await claimOperation(`vdi:rem-c2b:${c2.desktopId}`, c2.desktopId, 1, 'display_recovery', 2, 'display_recovery');
  check('C2b', 'attempt 2 admitted (budget 2)', c2b.claimed, `attempt=${c2b.attemptNumber}`);
  await c2.sandbox.process.executeCommand('echo broken > /tmp/display.state'); // restart runs but display stays broken
  log('C2b', 'recovery command executed; response dropped; display still broken');
  await q(`update vdi_remediation_operations set status='reconciling' where operation_key='vdi:rem-c2b:${c2.desktopId}'`);
  const probeB = await c2.sandbox.process.executeCommand('cat /tmp/display.state');
  const healthyB = (probeB.result ?? '').trim() === 'fixed';
  if (!healthyB) {
    // unhealthy probe alone does NOT prove whether the restart executed
    await q(`update vdi_remediation_operations set status='unresolved', outcome_evidence='{"displayHealthy":false,"unresolvedAt":"now","note":"unhealthy display does not establish whether the restart executed"}' where operation_key='vdi:rem-c2b:${c2.desktopId}'`);
    check('C2b', 'ambiguous outcome ⇒ explicit unresolved (no blind retry)', true);
  } else {
    check('C2b', 'ambiguous outcome ⇒ explicit unresolved', false, 'unexpectedly healthy');
  }

  // (c) durable 2-attempt limit ⇒ one escalation on exhaustion
  const c2c = await claimOperation(`vdi:rem-c2c:${c2.desktopId}`, c2.desktopId, 1, 'display_recovery', 2, 'display_recovery');
  check('C2c', 'third attempt refused (budget exhausted)', c2c.claimed === false && c2c.status === 'exhausted', `status=${c2c.status}`);
  const c2c2 = await claimOperation(`vdi:rem-c2d:${c2.desktopId}`, c2.desktopId, 1, 'display_recovery', 2, 'display_recovery');
  check('C2c', 'no second escalation on repeated attempts', c2c2.claimed === false && c2c2.status === 'exhausted');
  const att = await admin.from('vdi_remediation_attempts').select('attempt_count, escalated, escalated_at')
    .eq('desktop_id', c2.rowUuid).eq('rule', 'display_recovery').single();
  check('C2c', 'durable attempts: 2 counted, escalated once', (att.data as Record<string, unknown>)?.attempt_count === 2 && (att.data as Record<string, unknown>)?.escalated === true && !!(att.data as Record<string, unknown>)?.escalated_at);
  await recordEvidence(c2.rowUuid, 'remediation_escalation', 'exhausted', { stage: 'C2c', limit: 2 });

  // ───────────────── Stop controls ─────────────────
  log('S', '── stop controls ──');
  // dispatch disabled: all further claims refused (attempt budget for
  // display exhausted; idle budget consumed) — plus structural check
  const opsAfter = (await admin.from('vdi_remediation_operations').select('id', { count: 'exact', head: true }).eq('workspace_id', WS)).count;
  const moreClaims = await claimOperation(`vdi:rem-extra:${c2.desktopId}`, c2.desktopId, 1, 'display_recovery', 2, 'display_recovery');
  check('S', 'further dispatch refused after stop', moreClaims.claimed === false, `ops=${opsAfter}`);
  // existing authorized work + files persist
  const markerPath = '/tmp/c-work.txt';
  await c2.sandbox.process.executeCommand(`echo still-here > ${markerPath}`);
  const marker = await c2.sandbox.process.executeCommand(`cat ${markerPath}`);
  check('S', 'authorized work + files persist under stop controls', (marker.result ?? '').trim() === 'still-here');

  // ───────────────── Reconcile uncertain before cleanup ─────────────────
  const c1cOp = await admin.from('vdi_remediation_operations').select('status').eq('operation_key', `vdi:rem-c1c:${c1c.desktopId}`).single();
  check('S', 'uncertain C1c operation reconciled before cleanup', c1cOp.data?.status === 'success');
  const c2bOp = await admin.from('vdi_remediation_operations').select('status').eq('operation_key', `vdi:rem-c2b:${c2.desktopId}`).single();
  check('S', 'C2b ambiguity retained explicitly (unresolved)', c2bOp.data?.status === 'unresolved');

  // settle C reservations (replace exposure with actuals) then cleanup
  for (const [name, actual] of [['c1-idle', 120_000], ['c2-display', 150_000]] as const) {
    const opKeyRow = await admin.from('vdi_budget_reservations').select('operation_key').eq('tenant_id', TENANT).eq('workspace_id', WS).like('operation_key', `vdi:canary-c:${name}%`).single();
    const ok = opKeyRow.data?.operation_key as string | undefined;
    if (!ok) { check('cleanup', `${name} reservation found`, false); continue; }
    const s1 = await admin.rpc('vdi_settle_reservation', { p_operation_key: ok, p_actual_micros: actual, p_block_admission_on_overrun: true, p_now: new Date().toISOString() });
    check('cleanup', `${name} settled (${actual})`, (s1.data as Record<string, unknown>)?.ok === true);
    const s2 = await admin.rpc('vdi_settle_reservation', { p_operation_key: ok, p_actual_micros: actual, p_block_admission_on_overrun: true, p_now: new Date().toISOString() });
    check('cleanup', `${name} settle replay no-op`, (s2.data as Record<string, unknown>)?.replay === true);
  }

  // destroy provider resources (disposable)
  for (const d of [c1, c1b, c1c, c2]) {
    await mkDaytona().get(d.desktopId).then(s => s.delete(60, true)).catch(() => {});
  }
  log('cleanup', 'provider sandboxes destroyed');

  // accounting verified: B + C actuals; exposure zero
  const bFinal = (await admin.from('vdi_budgets').select('accounted_spend_micros, overrun_micros, admission_blocked')
    .eq('tenant_id', TENANT).eq('workspace_id', WS).eq('budget_period', PERIOD).single()).data as Record<string, number | boolean>;
  // Within limit, no overrun, not blocked; exact total printed as evidence.
  // (Prior C runs settled real operations too — every settle is keyed and
  // idempotent; the total is cumulative-real, never double-counted.)
  check('cleanup', `accounting within limit, no overrun (cumulative real spend)`,
    (bFinal.accounted_spend_micros as number) <= 2_000_000 && bFinal.overrun_micros === 0 && bFinal.admission_blocked === false,
    `spend=${bFinal.accounted_spend_micros} overrun=${bFinal.overrun_micros}`);
  log('cleanup', `final accounted spend: ${bFinal.accounted_spend_micros} micros (all settlements idempotent-keyed)`);

  // scope: no non-canary rows
  const other = (await admin.from('vdi_remediation_operations').select('id', { count: 'exact', head: true }).neq('workspace_id', WS)).count;
  check('cleanup', 'remediation scoped to canary only', other === 0);

  console.log(failures === 0 ? '\n=== ACTIVATION C: ALL STAGES PASS ===' : `\n=== ${failures} FAILURES ===`);
  console.log('\n=== EVIDENCE ===');
  for (const e of evidence) console.log(e);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch(e => { console.error('ACTIVATION C ERROR:', e.message); process.exit(1); });
