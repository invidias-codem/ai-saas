#!/usr/bin/env tsx
// scripts/context-sieve-calibrate.ts
// 6A.2 driver. THE ONLY place that touches Supabase for sieve calibration.
// calibrateSieve() stays pure — this script owns ingestion and reporting.
//
// Usage:
//   pnpm context:calibrate --days 7
//   pnpm context:calibrate --days 7 --json

import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabaseClient';
import { calibrateSieve, type SieveEventRow } from '../lib/context/sieve-calibration';

interface Args {
  days: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 7, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--days') { args.days = Number(argv[i + 1]); i += 1; }
    else if (argv[i] === '--json') args.json = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!supabaseAdmin) {
    throw new Error('supabaseAdmin not configured — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  }

  const sinceIso = new Date(Date.now() - args.days * 86_400_000).toISOString();

  // Single fetch; metadata holds the whole ContextSieveEvent row.
  const { data, error } = await supabaseAdmin
    .from('telemetry_events')
    .select('metadata, created_at')
    .eq('event_type', 'context_sieve_event')
    .gte('created_at', sinceIso);
  if (error) throw error;

  const rows: SieveEventRow[] = (data ?? [])
    .map((r: { metadata: Record<string, unknown> }) => r.metadata as unknown as SieveEventRow)
    .filter((r) => typeof r?.requestId === 'string');

  const report = calibrateSieve(rows);

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  const d = report.diagnostics;
  console.log(`requests: ${report.requests}  blocks: ${report.blocksConsidered}  (last ${args.days}d)`);
  console.log(`dataset integrity: ${JSON.stringify(d)}`);
  console.log(`overall defer rate: ${(report.overallDeferRate ?? 0).toFixed(3)}  keepAll: ${(report.keepAllRate ?? 0).toFixed(3)}  failOpen rows: ${(report.failOpenRate ?? 0).toFixed(3)}`);
  console.log(`PROTECTED interventions: ${report.protectedInterventionCount} (must be 0)`);
  console.log(`tokens: candidate=${report.candidateTokens} deferred=${report.proposedDeferredTokens} savings=${(report.proposedTokenSavingsRatio ?? 0).toFixed(3)}`);
  console.log(`latency ms: mean=${report.latencyMs.mean?.toFixed(1)} p50=${report.latencyMs.p50} p95=${report.latencyMs.p95}`);
  console.log(`DEFER REGRET RATE: ${report.deferRegretRate === null ? 'n/a (no DROP rows)' : report.deferRegretRate.toFixed(4)}${report.regretExamples.length ? `  examples: ${JSON.stringify(report.regretExamples.slice(0, 3))}` : ''}`);
  console.log(`by source: ${JSON.stringify(report.bySource)}`);
  console.log(`by relevance band: ${JSON.stringify(report.byRelevanceBand)}`);
  console.log(`versions: policy=${report.policyVersions.join(',')} sieve=${report.sieveVersions.join(',')}`);

  // Integrity verdict — mirrors the 6A.1 contracts against real rows.
  const integrityOk = d.requestsMissingSummary === 0
    && d.duplicateSummaries === 0
    && d.reconciliationFailures === 0
    && d.protectedDropRows === 0
    && d.malformedRows === 0;
  if (!integrityOk) {
    console.error('\nDATASET INTEGRITY: FAIL — 6A.1 invariants violated in real rows.');
    process.exit(1);
  }
  console.log('\nDATASET INTEGRITY: PASS');
}

main().catch((err) => {
  console.error('[context:calibrate] failed:', err);
  process.exit(1);
});
