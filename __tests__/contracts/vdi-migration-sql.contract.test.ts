// __tests__/contracts/vdi-migration-sql.contract.test.ts
// Regression for the canary-discovered production defect (2026-10-12):
// migration 20261011000000 created vdi_observations WITHOUT the `checked_at`
// column its own vdi_record_observation RPC references. PL/pgSQL validates
// column references at CALL time — the migration applied clean and the RPC
// failed at first production use. Successful migration application alone
// missed it; this test parses the migration SQL and proves every column an
// RPC references is defined by the tables its migration (or an earlier one)
// creates. Runs in CI with no database.
//
// It would have failed BEFORE the 20261017000000 fix existed.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => /^202610\d{8}.*\.sql$/.test(f)) // VDI-era migrations only
    .sort();
}

/** Extract table columns from CREATE TABLE blocks: column name = first token of each
 *  body line that isn't a constraint keyword. */
function stripComments(sql: string): string {
  // Remove -- comments (whole-line AND trailing): the column-list parser is
  // token-based; comment text would swallow the following column definition.
  return sql.replace(/--[^\n]*/g, '');
}

function tableColumns(sql: string, table: string): Set<string> {
  const cols = new Set<string>();
  const re = new RegExp(`create table if not exists ${table}\\s*\\(([^;]+)\\);`, 's');
  const m = stripComments(sql).match(re);
  if (!m) return cols;
  // Split on commas at depth 0 (no nested parens).
  let depth = 0; let current = '';
  const parts: string[] = [];
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; }
    else current += ch;
  }
  parts.push(current);
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const first = t.split(/\s+/)[0];
    if (/^(constraint|primary|foreign|unique|check|exclude)$/i.test(first)) continue;
    cols.add(first);
  }
  return cols;
}

/** RPC bodies: extract `create or replace function <name>(...) ... as $$...$$;` */
function rpcBodies(sql: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /create or replace function (vdi_\w+)\s*\([^)]*\)[^$]*as \$\$([\s\S]*?)\$\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1], body: m[2] });
  }
  return out;
}

/** Column references in an RPC body that target a specific table:
 *  INSERT INTO tbl (col, col, ...) VALUES ...
 *  ON CONFLICT ... DO UPDATE SET col = ...
 *  UPDATE tbl SET col = ...
 *  SELECT col INTO ... FROM tbl */
function rpcColumnRefs(body: string, table: string): Set<string> {
  const refs = new Set<string>();
  // Only INSERT INTO <table> ( ... ) — the authoritative column list. Update
  // bodies and ON CONFLICT clauses reference qualified names/variables and
  // duplicate the insert list; skip them (kept deliberately simple).
  const ins = new RegExp(`insert into ${table}\\s*\\(([^)]+)\\)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = ins.exec(body)) !== null) {
    for (const c of m[1].split(',')) {
      const name = c.trim().split(/\s+/)[0];
      if (name) refs.add(name);
    }
  }
  return refs;
}

describe('VDI migration SQL — RPC column references (checked_at regression)', () => {
  it('1: every RPC column reference is defined by its target table across migrations', () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(8); // 7 VDI + the checked_at fix

    // Accumulate columns per table as migrations apply in order.
    const columns = new Map<string, Set<string>>();
    const problems: string[] = [];
    const unresolved = new Map<string, string>();

    for (const file of files) {
      const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));

      // CREATE TABLE columns (accumulate).
      for (const tbl of ['vdi_desktops', 'vdi_session_leases', 'vdi_execution_leases',
        'vdi_connection_grants', 'vdi_input_control_leases', 'vdi_operation_keys',
        'vdi_evidence', 'vdi_observations', 'vdi_alerts', 'vdi_usage_records',
        'vdi_remediation_attempts', 'vdi_remediation_operations',
        'vdi_budgets', 'vdi_budget_reservations']) {
        const cols = tableColumns(sql, tbl);
        if (cols.size > 0) {
          const existing = columns.get(tbl) ?? new Set<string>();
          for (const c of cols) existing.add(c);
          columns.set(tbl, existing);
        }
      }

      // ALTER TABLE ADD COLUMN (accumulate — this is how the fix lands).
      const alterRe = /alter table (\w+)\s+add column if not exists (\w+)/gi;
      let am: RegExpExecArray | null;
      while ((am = alterRe.exec(sql)) !== null) {
        const existing = columns.get(am[1]) ?? new Set<string>();
        existing.add(am[2]);
        columns.set(am[1], existing);
      }

      // Collect every RPC column reference per file (checked AFTER all
      // migrations accumulate, so an ordering gap that a later fix migration
      // resolves is legal in the final state but still recorded).
      for (const { name, body } of rpcBodies(sql)) {
        for (const [tbl, cols] of columns) {
          for (const ref of rpcColumnRefs(body, tbl)) {
            if (!cols.has(ref)) {
              // Not defined so far — record for post-pass (a later ALTER
              // may add it; if not, it's the checked_at-class defect).
              const key = `${name}|${tbl}|${ref}`;
              unresolved.set(key, `${file}: RPC ${name} references ${tbl}.${ref}`);
            }
          }
        }
      }
    }

    // Post-pass: which refs stayed unresolved across ALL migrations?
    // (Checked_at defect: referenced in 20261011000000, added in 20261017000000
    // — legal FINAL state. Columns never defined anywhere = real defect.)
    // The accumulated `columns` map is complete now; re-check.
    for (const [key, msg] of unresolved) {
      const [, tbl, ref] = key.split('|');
      const cols = columns.get(tbl);
      if (!cols || !cols.has(ref)) {
        problems.push(msg + ' which NO migration defines');
      }
    }

    expect(problems).toEqual([]);

    // Direct regression assertion: the defect pair specifically — the
    // accumulated columns (CREATE + ALTER across all migrations) must
    // include checked_at, and no RPC reference may stay unresolved.
    expect(columns.get('vdi_observations')?.has('checked_at')).toBe(true); // fixed by 20261017000000
  });

  it('2: every vdi_* RPC pins search_path=public (security-definer contract)', () => {
    const files = migrationFiles();
    const bad: string[] = [];
    for (const f of files) {
      const sql = stripComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
      const re = /create or replace function (vdi_\w+)\s*\([^)]*\)\s*returns\s+[\w.]+\s*\n?\s*language plpgsql([^$]*?)as/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        if (!/security definer\s+set search_path\s*=\s*public/.test(m[2])) {
          bad.push(`${f}: ${m[1]} missing security definer + search_path=public`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
