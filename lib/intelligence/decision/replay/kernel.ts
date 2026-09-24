// lib/intelligence/decision/replay/kernel.ts
// Slice 3: deterministic replay kernel. PURE — no I/O, no Date.now(),
// no Math.random(), no network, no DB. Given the same frozen dataset and
// the same policy list it produces byte-for-byte identical reports.

import { createHash } from 'crypto';
import type { ReplayDataset, RoutingReplayPolicy, RoutingReplayRecord } from './types';
import { buildReport, type ReplayReport } from './metrics';

export type { ReplayReport } from './metrics';

// Explicit tier rank — the ONLY rank table in the replay plane.
// Comparative labels are descriptive (same/lower/higher), NOT causal
// (over/under-provisioned are interpretations and live outside this file).
export const TIER_RANK: Record<string, number> = { fast: 0, quality: 1, reasoning: 2 };

export type TierDelta = 'same' | 'hypothetical_lower' | 'hypothetical_higher';

export function tierDelta(productionTier: string, hypotheticalTier: string): TierDelta {
  const p = TIER_RANK[productionTier];
  const h = TIER_RANK[hypotheticalTier];
  if (p === undefined || h === undefined || p === h) return 'same';
  return h < p ? 'hypothetical_lower' : 'hypothetical_higher';
}

function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function datasetHash(records: RoutingReplayRecord[]): string {
  // ponytail: O(n log n) sort keeps the hash order-independent — the DB can
  // return rows in any order and we still get the same datasetHash.
  const ids = records.map((r) => canonical(r)).sort();
  return sha256(ids.join('\n'));
}

export interface PolicyReplayResult {
  policyId: string;
  policyVersion: string;
  report: ReplayReport;
  resultHash: string;
}

export interface ReplayRun {
  datasetHash: string;
  policies: { policyId: string; policyVersion: string }[];
  results: PolicyReplayResult[];
}

export function replay(
  dataset: ReplayDataset,
  policies: RoutingReplayPolicy[],
): ReplayRun {
  const results: PolicyReplayResult[] = policies.map((policy) => {
    const proposals = dataset.records.map((r) => ({
      record: r,
      proposal: policy.evaluate(r),
    }));
    const report = buildReport(proposals);
    const resultHash = sha256(canonical({ policyId: policy.id, policyVersion: policy.version, report }));
    return { policyId: policy.id, policyVersion: policy.version, report, resultHash };
  });
  return {
    datasetHash: dataset.datasetHash,
    policies: policies.map((p) => ({ policyId: p.id, policyVersion: p.version })),
    results,
  };
}
