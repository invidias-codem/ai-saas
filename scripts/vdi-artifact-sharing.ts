// scripts/vdi-artifact-sharing.ts
// VDI-6 runtime proof: two agents, one evidence-backed artifact, one sharing
// grant. Every retrieval checks the CURRENT grant; revocation blocks the
// next request; a third workspace is denied; denied requests leave state
// unchanged (before/after snapshots).
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const P = { tenant: 'art-tenant-p', ws: 'art-ws-p', agent: 'agent-producer' };
const G = { tenant: 'art-tenant-g', ws: 'art-ws-g', agent: 'agent-grantee' };
const T = { tenant: 'art-tenant-t', ws: 'art-ws-t', agent: 'agent-third' };

let failures = 0;
const evidence: string[] = [];
const log = (s: string, m: string) => { evidence.push(`[${s}] ${m}`); console.log(`[${s}] ${m}`); };
const check = (s: string, n: string, ok: boolean, d?: string) => {
  log(s, `${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);
  if (!ok) failures++;
};

async function snap() {
  const grants = (await admin.from('vdi_artifact_grants').select('id, status:revoked_at', { count: 'exact' }).like('operation_key', 'art:%')).count;
  const revs = await admin.from('vdi_artifact_retrievals').select('id', { count: 'exact' }).like('retrieved_by_workspace', 'art-%');
  const ev = (await admin.from('vdi_evidence').select('id', { count: 'exact' }).like('operation_type', 'art-artifact%')).count;
  return JSON.stringify({ grants, retrievals: revs.count, evidence: ev });
}

async function main() {
  // ════ Setup: producer desktop + evidence artifact ════
  const desktopRow = await admin.from('vdi_desktops').insert({
    desktop_id: `art-dt-${randomUUID().slice(0, 8)}`, tenant_id: P.tenant, workspace_id: P.ws,
    generation: 1, provider: 'art-test', provider_id: `art-sb-${randomUUID().slice(0, 8)}`,
    runtime_type: 'container', persistence: 'workspace', image_version: 'art', spec_hash: 'art', phase: 'ready',
  }).select('id').single();
  if (desktopRow.error) throw new Error('desktop insert: ' + desktopRow.error.message);
  const dtId = (desktopRow.data as { id: string }).id;

  const artifactContentHash = `sha256:${randomUUID()}`;
  const artifactRow = await admin.from('vdi_evidence').insert({
    desktop_id: dtId, operation_key: `art:artifact:${randomUUID()}`,
    operation_type: 'art-artifact-v1',
    desired_state: 'shared', observed_state: 'ready',
    metadata: { contentHash: artifactContentHash, title: 'iso artifact', payload: 'EVIDENCE-BACKED-CONTENT' },
  }).select('id').single();
  if (artifactRow.error) throw new Error('artifact insert: ' + artifactRow.error.message);
  const artifactId = (artifactRow.data as { id: string }).id;
  log('setup', `producer desktop + artifact evidence row ${artifactId.slice(0, 8)}… (hash ${artifactContentHash.slice(0, 18)}…)`);

  // ════ Grant creation ════
  const grantKey = `art:grant:${randomUUID()}`;
  const g1 = await admin.rpc('vdi_grant_artifact_access', {
    p_operation_key: grantKey, p_artifact_evidence_id: artifactId,
    p_producer_tenant: P.tenant, p_producer_workspace: P.ws,
    p_grantee_tenant: G.tenant, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  const g1d = g1.data as Record<string, unknown>;
  check('grant', 'grant created for grantee agent', g1d?.granted === true && g1d?.replay === false, `grant_id=${String(g1d?.grant_id).slice(0, 8)}…`);

  // Idempotent replay
  const g2 = await admin.rpc('vdi_grant_artifact_access', {
    p_operation_key: grantKey, p_artifact_evidence_id: artifactId,
    p_producer_tenant: P.tenant, p_producer_workspace: P.ws,
    p_grantee_tenant: G.tenant, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  const g2d = g2.data as Record<string, unknown>;
  check('grant', 'grant replay returns original (idempotent)', g2d?.granted === true && g2d?.replay === true && g2d?.grant_id === g1d?.grant_id);

  // Conflicting binding refused
  const g3 = await admin.rpc('vdi_grant_artifact_access', {
    p_operation_key: grantKey, p_artifact_evidence_id: artifactId,
    p_producer_tenant: P.tenant, p_producer_workspace: P.ws,
    p_grantee_tenant: T.tenant, p_grantee_workspace: T.ws, p_grantee_agent: T.agent,
  });
  check('grant', 'conflicting binding (third ws) refused', (g3.data as Record<string, unknown>)?.granted === false);

  // Forged producer scope refused
  const g4 = await admin.rpc('vdi_grant_artifact_access', {
    p_operation_key: `art:grant:${randomUUID()}`, p_artifact_evidence_id: artifactId,
    p_producer_tenant: G.tenant, p_producer_workspace: G.ws,  // grantee claims ownership
    p_grantee_tenant: G.tenant, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  check('grant', 'forged producer scope refused (ownership check)', (g4.data as Record<string, unknown>)?.granted === false, String((g4.data as Record<string, unknown>)?.reason));

  // ════ Allowed retrieval (provenance preserved) ════
  const r1 = await admin.rpc('vdi_retrieve_shared_artifact', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  const r1d = r1.data as Record<string, unknown>;
  const prov = r1d?.provenance as Record<string, unknown> | undefined;
  check('retrieve', 'grantee retrieves artifact (allowed)', r1d?.allowed === true && r1d?.reference_only === true);
  check('retrieve', 'provenance preserved (producer ws + hash + type)', prov?.producer_workspace === P.ws && prov?.operation_type === 'art-artifact-v1' && String(prov?.recorded_at).length > 0);
  const artMeta = prov?.metadata as Record<string, unknown> | undefined;
  check('retrieve', 'original content hash referenced (not copied)', artMeta?.contentHash === artifactContentHash);

  const snapBeforeDeny = await snap();

  // ════ Third workspace denied ════
  const r2 = await admin.rpc('vdi_retrieve_shared_artifact', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: T.ws, p_grantee_agent: T.agent,
  });
  const r2d = r2.data as Record<string, unknown>;
  check('deny', 'third workspace denied', r2d?.allowed === false, String(r2d?.reason));

  // ════ Revocation blocks the NEXT retrieval ════
  const rv = await admin.rpc('vdi_revoke_artifact_access', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
    p_revoked_by: P.agent, p_reason: 'runtime-proof revocation', p_now: new Date().toISOString(),
  });
  check('revoke', 'revocation recorded', rv.data === true);
  const r3 = await admin.rpc('vdi_retrieve_shared_artifact', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  const r3d = r3.data as Record<string, unknown>;
  check('revoke', 'NEXT retrieval after revocation denied', r3d?.allowed === false, String(r3d?.reason));
  // repeated denials stay denied
  const r4 = await admin.rpc('vdi_retrieve_shared_artifact', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
  });
  check('revoke', 'subsequent retrievals stay denied', (r4.data as Record<string, unknown>)?.allowed === false);
  // revocation idempotent
  const rv2 = await admin.rpc('vdi_revoke_artifact_access', {
    p_artifact_evidence_id: artifactId, p_grantee_workspace: G.ws, p_grantee_agent: G.agent,
    p_revoked_by: P.agent, p_reason: 'idempotent', p_now: new Date().toISOString(),
  });
  check('revoke', 're-revocation idempotent (true)', rv2.data === true);

  // ════ State-unchanged verification for denied requests ════
  // After the allowed retrieval (r1), all further requests were denied:
  // grants unchanged (1 active → revoked), retrievals unchanged (1 audit row),
  // evidence unchanged.
  const snapAfterDeny = await snap();
  const before = JSON.parse(snapBeforeDeny);
  const after = JSON.parse(snapAfterDeny);
  check('verify', 'denied requests created NO retrieval audit rows', after.retrievals === before.retrievals, `${before.retrievals}→${after.retrievals}`);
  check('verify', 'denied requests created NO new evidence rows', after.evidence === before.evidence, `${before.evidence}→${after.evidence}`);
  check('verify', 'artifact never copied (reference-only retrievals)', after.evidence === before.evidence);
  const grantRows = await admin.from('vdi_artifact_grants').select('revoked_at, grantee_workspace').like('operation_key', 'art:%');
  const rows = grantRows.data ?? [];
  check('verify', 'exactly one grant row, revoked, grantee = G only',
    rows.length === 1 && rows[0].revoked_at !== null && rows[0].grantee_workspace === G.ws);
  const retRows = await admin.from('vdi_artifact_retrievals').select('retrieved_by_workspace').like('retrieved_by_workspace', 'art-%');
  check('verify', 'all retrieval audit rows from the grantee only',
    (retRows.data ?? []).every(r => r.retrieved_by_workspace === G.ws), `count=${(retRows.data ?? []).length}`);

  // ════ Cleanup ════
  await admin.from('vdi_artifact_retrievals').delete().like('retrieved_by_workspace', 'art-%');
  await admin.from('vdi_artifact_grants').delete().like('operation_key', 'art:%');
  await admin.from('vdi_evidence').delete().eq('operation_type', 'art-artifact-v1');
  await admin.from('vdi_desktops').delete().eq('workspace_id', P.ws);
  const left = (await admin.from('vdi_desktops').select('id', { count: 'exact', head: true }).eq('workspace_id', P.ws)).count;
  const leftGrants = (await admin.from('vdi_artifact_grants').select('id', { count: 'exact', head: true }).like('operation_key', 'art:%')).count;
  check('cleanup', 'all art rows removed', left === 0 && leftGrants === 0, `desktops=${left} grants=${leftGrants}`);

  console.log(failures === 0 ? '\n=== VDI-6 ARTIFACT SHARING: ALL PROOFS PASS ===' : `\n=== ${failures} FAILURES ===`);
  console.log('\n=== EVIDENCE ===');
  for (const e of evidence) console.log(e);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch(e => { console.error('ART ERROR:', e.message); process.exit(1); });
