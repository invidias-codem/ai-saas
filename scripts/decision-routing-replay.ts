#!/usr/bin/env tsx
// scripts/decision-routing-replay.ts
// Slice 3 replay driver. THE ONLY place that touches Supabase. Kernel stays
// pure — this script owns ingestion, freezing, and reporting.
//
// Usage:
//   pnpm decision:replay --days 7 --policy routing-capability-v1
//   pnpm decision:replay --days 7 --question-set 2 --tier-policy 2 --intent coding_task
//   pnpm decision:replay --days 7 --json
//
// Defaults intentionally select the v2 cohort only. Gen-0 and v2 never mix:
// the script filters WHERE, then normalizeRows asserts the cohort again.

import 'dotenv/config';
import { supabaseAdmin } from '../lib/supabaseClient';
import { CapabilityRoutingPolicyV1, ROUTING_CAPABILITY_V1_ID } from '../lib/intelligence/decision/policies/routing/capabilityPolicyV1';
import { datasetHash, replay } from '../lib/intelligence/decision/replay/kernel';
import { normalizeRows } from '../lib/intelligence/decision/replay/normalize';
import type { RoutingReplayPolicy } from '../lib/intelligence/decision/replay/types';

interface Args {
  days: number;
  policy?: string;
  questionSet: number;
  tierPolicy: number;
  intent?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { days: 7, questionSet: 2, tierPolicy: 2, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--days') { args.days = Number(v); i += 1; }
    else if (k === '--policy') { args.policy = v; i += 1; }
    else if (k === '--question-set') { args.questionSet = Number(v); i += 1; }
    else if (k === '--tier-policy') { args.tierPolicy = Number(v); i += 1; }
    else if (k === '--intent') { args.intent = v; i += 1; }
    else if (k === '--json') { args.json = true; }
  }
  return args;
}

const POLICIES: RoutingReplayPolicy[] = [new CapabilityRoutingPolicyV1()];

async function main() {
  const args = parseArgs(process.argv);
  if (!supabaseAdmin) {
    throw new Error('supabaseAdmin not configured — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY');
  }

  const sinceIso = new Date(Date.now() - args.days * 86_400_000).toISOString();

  // Slice-3 cohort guard: never silently mix experimental generations.
  const telemetryQuery = supabaseAdmin
    .from('telemetry_events')
    .select('event_type, metadata')
    .in('event_type', ['jev_shadow_decision', 'decision_event'])
    .gte('created_at', sinceIso)
    .eq('metadata->>questionSetVersion', String(args.questionSet))
    .eq('metadata->>tierPolicyVersion', String(args.tierPolicy));

  const { data: telemetryRows, error: telemetryErr } = await telemetryQuery;
  if (telemetryErr) throw telemetryErr;

  const { data: ucolRows, error: ucolErr } = await supabaseAdmin
    .from('ucol_routing_telemetry')
    .select('request_id, outcome, latency_ms, estimated_cost_usd, user_correction_signal')
    .gte('route_timestamp', sinceIso);
  if (ucolErr) throw ucolErr;

  let records = normalizeRows(telemetryRows ?? [], ucolRows ?? []);
  if (args.intent) records = records.filter((r) => r.production.intent === args.intent);

  const dataset = { datasetHash: datasetHash(records), records };

  const selected = args.policy
    ? POLICIES.filter((p) => p.id === args.policy)
    : POLICIES;
  if (selected.length === 0) {
    throw new Error(`unknown --policy "${args.policy}" (known: ${POLICIES.map((p) => p.id).join(', ')})`);
  }

  const result = replay(dataset, selected);

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  console.log(`datasetHash: ${result.datasetHash}`);
  console.log(`days: ${args.days}  questionSetVersion: ${args.questionSet}  tierPolicyVersion: ${args.tierPolicy}${args.intent ? `  intent: ${args.intent}` : ''}`);
  for (const r of result.results) {
    console.log(`\npolicy: ${r.policyId}@${r.policyVersion}  resultHash: ${r.resultHash}`);
    const rep = r.report;
    console.log(`  total=${rep.total} usable=${rep.usable} unavailable=${rep.unavailable} availability=${fmtRate(rep.availabilityRate)}`);
    console.log(`  tierDelta same=${rep.tierDelta.same} lower=${rep.tierDelta.hypothetical_lower} higher=${rep.tierDelta.hypothetical_higher}`);
    console.log(`  production outcomes: ${JSON.stringify(rep.productionOutcomes)}`);
    console.log(`  production success rate: ${fmtRate(rep.productionSuccessRate)}  explicit correction rate: ${fmtRate(rep.explicitCorrectionRate)}`);
    console.log(`  latency ms mean=${fmtNum(rep.latencyMs.mean)} p50=${fmtNum(rep.latencyMs.p50)} p95=${fmtNum(rep.latencyMs.p95)}`);
    console.log(`  cost usd mean=${fmtNum(rep.costUsd.mean)} total=${fmtNum(rep.costUsd.total)}`);
    console.log(`  success rate where hypothetical tier == production: ${fmtRate(rep.byDeltaSuccessRate.same)}`);
    console.log(`  success rate where hypothetical tier  < production: ${fmtRate(rep.byDeltaSuccessRate.hypothetical_lower)}`);
    console.log(`  success rate where hypothetical tier  > production: ${fmtRate(rep.byDeltaSuccessRate.hypothetical_higher)}`);
    console.log(`  byIntent: ${JSON.stringify(rep.byIntent)}`);
    console.log(`  byCapability: ${JSON.stringify(rep.byCapability)}`);
    console.log(`  byEffort: ${JSON.stringify(rep.byEffort)}`);
    console.log(`  byLease: ${JSON.stringify(rep.byLease)}`);
    console.log(`  byRiskBand: ${JSON.stringify(rep.byRiskBand)}`);
    console.log(`  byQuestionSetVersion: ${JSON.stringify(rep.byQuestionSetVersion)}`);
    console.log(`  byTierPolicyVersion: ${JSON.stringify(rep.byTierPolicyVersion)}`);
  }
}

function fmtRate(v: number | null): string {
  return v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v: number | null): string {
  return v === null ? 'n/a' : v.toFixed(1);
}

main().catch((err) => {
  console.error('[decision:replay] failed:', err);
  process.exit(1);
});
