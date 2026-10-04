// scripts/decision-replay-selftest.ts
// 3A runnable check for normalizeRows determinism + diagnostics.
// Run: npx tsx scripts/decision-replay-selftest.ts

import { normalizeRows } from '../lib/intelligence/decision/replay/normalize';
import type { TelemetryRow, UcolTelemetryRow } from '../lib/intelligence/decision/replay/normalize';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// --- Deterministic earliest-shadow selection --------------------------------
const shadowA: TelemetryRow = {
  event_type: 'jev_shadow_decision',
  created_at: '2026-09-27T10:00:00Z',
  metadata: {
    requestId: 'r1',
    status: 'ok',
    proposedCapability: 'fast',
    proposedEffort: 'low',
    questionSetVersion: 2,
    tierPolicyVersion: 2,
    jevLatencyMs: 100,
    productionIntent: 'coding_task',
    productionTier: 'reasoning',
  },
};
const shadowA_lateDupe: TelemetryRow = {
  ...shadowA,
  created_at: '2026-09-27T11:00:00Z',
  metadata: { ...shadowA.metadata, proposedCapability: 'reasoning' },
};
const outcome1: UcolTelemetryRow = {
  request_id: 'r1',
  route_timestamp: '2026-09-27T10:05:00Z',
  outcome: 'success',
  latency_ms: 1200,
  estimated_cost_usd: 0.01,
  user_correction_signal: 'none',
};

// Order 1: early first
const r1 = normalizeRows([shadowA, shadowA_lateDupe], [outcome1]);
// Order 2: late first (reversed retrieval order)
const r2 = normalizeRows([shadowA_lateDupe, shadowA], [outcome1]);

assert(r1.records.length === 1 && r2.records.length === 1, 'one record per requestId');
assert(
  r1.records[0].judgment?.capability === r2.records[0].judgment?.capability,
  'earliest shadow wins regardless of retrieval order',
);
assert(r1.records[0].judgment?.capability === 'fast', 'earliest shadow is the fast judgment');
assert(r1.diagnostics.duplicateShadowRequests === 1, 'duplicate shadow counted');
assert(r1.diagnostics.joinedRows === 1, 'joinedRows counted');
assert(r1.records[0].decision?.available === true, 'decision.available true on ok');
assert(r1.records[0].decision?.latencyMs === 100, 'decision latencyMs captured');
assert(r1.records[0].decision?.inputTokens === undefined, 'absent tokens stay undefined');

// --- Deterministic latest-outcome selection ---------------------------------
const outcomeEarly: UcolTelemetryRow = { ...outcome1, outcome: 'failed', route_timestamp: '2026-09-27T10:05:00Z' };
const outcomeLate: UcolTelemetryRow = { ...outcome1, outcome: 'success', route_timestamp: '2026-09-27T10:30:00Z' };

const r3 = normalizeRows([shadowA], [outcomeEarly, outcomeLate]);
const r4 = normalizeRows([shadowA], [outcomeLate, outcomeEarly]);
assert(
  r3.records[0].outcome.status === r4.records[0].outcome.status,
  'latest outcome wins regardless of retrieval order',
);
assert(r3.records[0].outcome.status === 'success', 'latest outcome is the finalized success');
assert(r3.diagnostics.duplicateOutcomeRequests === 1, 'duplicate outcome counted');

// --- Missing outcome → excluded, counted -------------------------------------
const r5 = normalizeRows([shadowA], []);
assert(r5.records.length === 0, 'no outcome → no record');
assert(r5.diagnostics.missingOutcomeRows === 1, 'missing outcome counted');

// --- Malformed row → rejected, counted ---------------------------------------
const malformed: TelemetryRow = { event_type: 'jev_shadow_decision', created_at: '2026-09-27T12:00:00Z', metadata: { noRequestId: true } };
const r6 = normalizeRows([malformed], []);
assert(r6.diagnostics.rejectedMalformedRows === 1, 'malformed row rejected+counted');

console.log('PASS: normalizeRows determinism + diagnostics self-check');
