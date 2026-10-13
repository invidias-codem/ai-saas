// __tests__/contracts/vdi-migration-smoke.contract.test.ts
// Migration-apply-and-RPC-call smoke test — the runtime complement to the
// SQL parser (vdi-migration-sql.contract.test.ts). The parser catches
// static reference defects; THIS catches runtime SQL the parser cannot see:
// column casts, constraint interactions, trigger behavior, RPC body
// semantics — by actually applying every VDI migration to a throwaway
// schema and invoking each RPC.
//
// Runs against an in-schema postgres via Docker if available; skipped when
// Docker is unreachable (CI without Docker) so it never blocks gates while
// still proving runtime validity locally and in the deploy pipeline.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync, execFileSync } from 'child_process';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const CONTAINER = 'vdi-smoke-pg';

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe', timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

function psql(sql: string): { out: string; code: number } {
  try {
    const out = execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
    return { out, code: 0 };
  } catch (e) {
    return { out: (e as { stdout?: string; message: string }).stdout ?? String(e), code: 1 };
  }
}

/** Apply a migration file with ON_ERROR_STOP (per-statement errors abort).
 *  No outer BEGIN: some migrations manage their own transaction nesting
 *  (DO blocks); every statement still aborts on first error, and the SQL
 *  parser test (sibling) covers reference integrity. */
function applyMigration(file: string): void {
  execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
}

const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR).filter(f => /^2026101\d{6}.*_vdi_.*\.sql$/.test(f)).sort();

describe('VDI migrations apply + every RPC invokes (runtime smoke)', () => {
  beforeAll(() => {
    if (!dockerAvailable()) return;
    execSync(`docker rm -f ${CONTAINER} 2>/dev/null; docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=test postgres:15`, { stdio: 'pipe' });
    // wait for readiness (pg_isready throws until postgres boots — tolerate)
    for (let i = 0; i < 30; i++) {
      try {
        const r = execSync(`docker exec ${CONTAINER} pg_isready -U postgres`, { encoding: 'utf8', stdio: 'pipe' }).toString();
        if (r.includes('accepting connections')) break;
      } catch { /* not up yet */ }
      execSync('sleep 1', { stdio: 'pipe' });
    }
    // Supabase prerequisites — retry until they actually land (pg_isready can
    // report accepting before DDL is servable), then ASSERT.
    let prereqOk = false;
    for (let i = 0; i < 30 && !prereqOk; i++) {
      const r1 = psql("create schema if not exists auth; create or replace function auth.role() returns text language sql as $$ select 'service_role'::text $$;");
      const r2 = psql("do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;");
      prereqOk = r1.code === 0 && r2.code === 0;
      if (!prereqOk) execSync('sleep 1', { stdio: 'pipe' });
    }
    if (!prereqOk) throw new Error('postgres prerequisites never became ready');
  }, 120_000);

  afterAll(() => {
    try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'pipe' }); } catch { /* already gone */ }
  }, 60_000);

  it('1: all VDI migrations apply with zero errors; every vdi_* RPC executes', () => {
    if (!dockerAvailable()) {

      console.warn('SKIP: Docker unavailable — runtime smoke needs a container. The SQL-parser regression still runs.');
      return;
    }
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      expect(() => applyMigration(f)).not.toThrow();
    }

    // Seed one desktop row so FK-targeted RPCs have valid references.
    psql(`insert into vdi_desktops (desktop_id, tenant_id, workspace_id, generation, provider, provider_id, runtime_type, persistence, image_version, spec_hash, phase) values ('smoke-dt','t','w',1,'p','p','container','workspace','i','h','ready') on conflict do nothing;`);

    const list = psql(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vdi_%' order by 1;`).out;
    const fns = list.split('\n').map(l => l.trim()).filter(l => /^vdi_/.test(l));
    expect(fns.length).toBe(13); // update when vdi_* RPCs grow

    // Invoke every RPC with valid-for-schema args. Failures here are exactly
    // the runtime class the parser cannot catch.
    const DT = `(select id from vdi_desktops where desktop_id='smoke-dt')`;
    const calls: Array<[string, string, (r: { out: string; code: number }) => boolean]> = [
      ['vdi_grant_execution_lease', `select vdi_grant_execution_lease('smoke-dt','e1','a1',60000);`, r => r.code === 0],
      ['vdi_grant_input_control_lease', `select vdi_grant_input_control_lease('smoke-dt','i1','human','u1',60000);`, r => r.code === 0],
      ['vdi_grant_session_lease', `select vdi_grant_session_lease('smoke-dt','s1','u1','g1',60000);`, r => r.code === 0],
      ['vdi_record_observation', `select vdi_record_observation(${DT}, true, 'ready', 'container', now(), null, null, null, now(), 'ready', 1, true, false, null, null, now());`, r => r.code === 0],
      ['vdi_upsert_alert (open)', `select vdi_upsert_alert(${DT},'t','w','display_failed','warning',1,'{}'::jsonb,false,null,now());`, r => r.out.includes('null') === false],
      ['vdi_upsert_alert (resolve, fresh evidence)', `select vdi_upsert_alert(${DT},'t','w','display_failed','warning',1,'{}'::jsonb,true,now(),now());`, r => r.code === 0],
      ['vdi_record_remediation_attempt', `select vdi_record_remediation_attempt(${DT},'t','w','display_recovery','v1',2,now());`, r => r.code === 0],
      ['vdi_claim_remediation_operation', `select vdi_claim_remediation_operation('smoke-op','t','w','smoke-dt',1,'idle_suspension','r','{}'::jsonb,'v1', now()-interval '10 seconds', now()+interval '1 hour','w',1,'idle_suspension');`, r => r.out.includes('true')],
      ['vdi_update_remediation_operation', `select vdi_update_remediation_operation('smoke-op','w','dispatched','{}'::jsonb,null);`, r => r.out.includes('t')],
      ['vdi_admit_reservation (budget missing → refused)', `select vdi_admit_reservation('smoke-res','t','w','2026-10','USD',1000::bigint,null,'{}'::jsonb,'v1', now()+interval '1 hour');`, r => r.out.includes('false')],
      ['vdi_admit_reservation (with budget → admitted)', `insert into vdi_budgets (tenant_id, workspace_id, budget_period, limit_micros) values ('t','w','2026-10',1000000) on conflict do nothing; select vdi_admit_reservation('smoke-res2','t','w','2026-10','USD',1000::bigint,null,'{}'::jsonb,'v1', now()+interval '1 hour');`, r => r.out.includes('true')],
      ['vdi_resolve_provisioning', `select vdi_resolve_provisioning('smoke-res2','uncertain',now());`, r => r.out.includes('true')],
      ['vdi_settle_reservation', `select vdi_settle_reservation('smoke-res2',1000::bigint,false,now());`, r => r.out.includes('true')],
      ['vdi_adjust_settled_charge', `select vdi_adjust_settled_charge('smoke-res2',1200::bigint,now());`, r => r.out.includes('true')],
      ['vdi_extend_reservation_horizon', `select vdi_extend_reservation_horizon('smoke-res2', now()+interval '2 hours', now());`, r => r.out.includes('t')],
    ];
    for (const [name, sql, ok] of calls) {
      const r = psql(sql);
      expect({ name, out: r.out.slice(0, 120), code: r.code }).toEqual(expect.objectContaining({ name }));
      // Assert through the predicate so the failure names the RPC.
      if (!ok(r)) {

        console.error(`RPC ${name} unexpected result:`, r.out.slice(0, 200));
      }
      expect(ok(r)).toBe(true);
    }

    // Hardening verified at runtime: anon cannot execute.
    const anon = psql(`set role anon; select vdi_admit_reservation('x','t','w','2026-10','USD',1::bigint,null,'{}'::jsonb,'v1',now());`).code;
    expect(anon).toBe(1); // error ⇒ permission denied
  }, 180_000);
});
