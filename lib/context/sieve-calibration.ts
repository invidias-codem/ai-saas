// lib/context/sieve-calibration.ts
// 6A.2: Context-sieve calibration. PURE — no I/O, no wall-clock, no RNG.
// Mirrors the replay-plane pattern: a script owns Supabase ingestion, this
// module computes the metric set that gates 6B.
//
// Sacred metric: defer_regret_rate — blocks proposed DROP that later proved
// necessary. Its full computation needs downstream signals (regeneration,
// recall, corrections) that 6B wires in; this version computes the
// measurable core from the shadow dataset and exposes the join structure.

export interface SieveEventRow {
  requestId: string;
  blockId: string;
  blockType: string;
  decision: 'KEEP' | 'DROP' | null;
  reason: string;
  relevanceScore: number | null;
  protected: boolean;
  failOpen: boolean;
  policyVersion: string;
  sieveVersion: string;
  inputHash: string;
  blockHash: string;
  latencyMs: number;
  createdAt: string;
  estimatedTokens: number;
  isSummary: boolean;
  candidateTokens?: number;
  proposedActiveTokens?: number;
  proposedDeferredTokens?: number;
  proposedReductionRatio?: number;
  blocksConsidered?: number;
  blocksDeferred?: number;
}

export interface SieveDatasetDiagnostics {
  requestRows: number;
  blockRows: number;
  requestsMissingSummary: number;
  duplicateSummaries: number;
  reconciliationFailures: number; // summary vs block-rows mismatch
  protectedDropRows: number;      // contract violation if > 0
  malformedRows: number;
}

export interface BucketStat {
  total: number;
  dropped: number;
  dropRate: number | null;
  tokens: number;
}

export interface SieveCalibrationReport {
  diagnostics: SieveDatasetDiagnostics;

  requests: number;
  blocksConsidered: number;
  blocksDeferred: number;
  overallDeferRate: number | null;

  /** Pruning ratio by block source (fact/memory/graph/research/profile). */
  bySource: Record<string, BucketStat>;
  /** Defer rate by relevance band — the lexical score distribution. */
  byRelevanceBand: Record<string, BucketStat>;

  /** Fraction of requests that failed open (KEEP_ALL). */
  keepAllRate: number | null;
  /** Protected blocks that appeared as droppable — MUST be 0 (contract). */
  protectedInterventionCount: number;
  /** Rows with failOpen=true at block level. */
  failOpenRate: number | null;

  candidateTokens: number;
  proposedActiveTokens: number;
  proposedDeferredTokens: number;
  proposedTokenSavingsRatio: number | null;

  latencyMs: { mean: number | null; p50: number | null; p95: number | null };

  /**
   * defer_regret_rate — SACRED. Core computation from the shadow dataset:
   * DROP rows whose blockHash later appears in a KEEP row of the SAME
   * requestId (the block came back), or whose request later shows an
   * explicit-correction outcome signal. ponytail: the second signal needs
   * the 6B recall surface + ucol join; until then this is the measurable
   * lower bound. Zero until real traffic exists.
   */
  deferRegretRate: number | null;
  regretExamples: Array<{ requestId: string; blockId: string; blockHash: string }>;

  policyVersions: string[];
  sieveVersions: string[];
}

function pctl(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function relevanceBand(score: number | null): string {
  if (score === null) return 'no_judgment';
  if (score < 0.1) return '0.00-0.10';
  if (score < 0.25) return '0.10-0.25';
  if (score < 0.5) return '0.25-0.50';
  if (score < 0.75) return '0.50-0.75';
  return '0.75-1.00';
}

function bucket(map: Map<string, BucketStat>, key: string, dropped: boolean, tokens: number) {
  const b = map.get(key) ?? { total: 0, dropped: 0, dropRate: null, tokens: 0 };
  b.total += 1;
  if (dropped) b.dropped += 1;
  b.tokens += tokens;
  map.set(key, b);
}

function finalize(map: Map<string, BucketStat>): Record<string, BucketStat> {
  const out: Record<string, BucketStat> = {};
  for (const [k, b] of [...map.entries()].sort(([a], [c]) => (a < c ? -1 : 1))) {
    out[k] = { ...b, dropRate: b.total ? b.dropped / b.total : null };
  }
  return out;
}

export function calibrateSieve(rows: SieveEventRow[]): SieveCalibrationReport {
  const summaries = rows.filter((r) => r.isSummary);
  const blocks = rows.filter((r) => !r.isSummary);

  const byRequest = new Map<string, SieveEventRow[]>();
  for (const r of rows) {
    const list = byRequest.get(r.requestId) ?? [];
    list.push(r);
    byRequest.set(r.requestId, list);
  }

  // ── Dataset integrity (the 6A.1 invariants, checked against REAL rows) ──
  const requestIds = new Set(rows.map((r) => r.requestId));
  let duplicateSummaries = 0;
  let requestsMissingSummary = 0;
  let reconciliationFailures = 0;
  let malformedRows = 0;

  for (const [requestId, list] of byRequest) {
    const sums = list.filter((r) => r.isSummary);
    if (sums.length === 0) {
      requestsMissingSummary += 1;
    } else if (sums.length > 1) {
      duplicateSummaries += sums.length - 1;
    }
    const s = sums[0];
    if (s) {
      const blockRows = list.filter((r) => !r.isSummary);
      if (s.blocksConsidered !== undefined && s.blocksConsidered !== blockRows.length) {
        reconciliationFailures += 1;
      }
      if (s.blocksDeferred !== undefined && s.blocksDeferred !== blockRows.filter((b) => b.decision === 'DROP').length) {
        reconciliationFailures += 1;
      }
    }
  }
  for (const r of rows) {
    if (typeof r.requestId !== 'string' || typeof r.blockId !== 'string' || typeof r.inputHash !== 'string') {
      malformedRows += 1;
    }
  }
  const protectedDropRows = blocks.filter((b) => b.protected && b.decision === 'DROP').length;

  // ── Metrics ──────────────────────────────────────────────────────────
  const bySource = new Map<string, BucketStat>();
  const byBand = new Map<string, BucketStat>();

  for (const b of blocks) {
    const dropped = b.decision === 'DROP';
    bucket(bySource, b.blockType, dropped, b.estimatedTokens ?? 0);
    bucket(byBand, relevanceBand(b.relevanceScore), dropped, b.estimatedTokens ?? 0);
  }

  const requests = summaries.length;
  const failOpenRequests = summaries.filter((s) => s.failOpen).length;
  const candidateTokens = summaries.reduce((a, s) => a + (s.candidateTokens ?? 0), 0);
  const deferredTokens = summaries.reduce((a, s) => a + (s.proposedDeferredTokens ?? 0), 0);
  const activeTokens = summaries.reduce((a, s) => a + (s.proposedActiveTokens ?? 0), 0);
  const latencies = rows.map((r) => r.latencyMs).filter((v): v is number => typeof v === 'number' && v >= 0).sort((a, b) => a - b);

  // ── defer_regret_rate (measurable core) ──────────────────────────────
  // A DROP block whose blockHash reappears as a KEEP in the same request
  // (re-retrieved within the turn) is observed regret.
  const keepHashesByRequest = new Map<string, Set<string>>();
  for (const b of blocks) {
    if (b.decision === 'KEEP') {
      const set = keepHashesByRequest.get(b.requestId) ?? new Set<string>();
      set.add(b.blockHash);
      keepHashesByRequest.set(b.requestId, set);
    }
  }
  const regretExamples: SieveCalibrationReport['regretExamples'] = [];
  let regretCount = 0;
  let dropCount = 0;
  for (const b of blocks) {
    if (b.decision !== 'DROP') continue;
    dropCount += 1;
    if (keepHashesByRequest.get(b.requestId)?.has(b.blockHash)) {
      regretCount += 1;
      regretExamples.push({ requestId: b.requestId, blockId: b.blockId, blockHash: b.blockHash });
    }
  }

  const droppedBlocks = blocks.filter((b) => b.decision === 'DROP').length;

  return {
    diagnostics: {
      requestRows: requestIds.size,
      blockRows: blocks.length,
      requestsMissingSummary,
      duplicateSummaries,
      reconciliationFailures,
      protectedDropRows,
      malformedRows,
    },
    requests,
    blocksConsidered: blocks.length,
    blocksDeferred: droppedBlocks,
    overallDeferRate: blocks.length ? droppedBlocks / blocks.length : null,
    bySource: finalize(bySource),
    byRelevanceBand: finalize(byBand),
    keepAllRate: requests ? failOpenRequests / requests : null,
    protectedInterventionCount: protectedDropRows,
    failOpenRate: rows.length ? rows.filter((r) => r.failOpen).length / rows.length : null,
    candidateTokens,
    proposedActiveTokens: activeTokens,
    proposedDeferredTokens: deferredTokens,
    proposedTokenSavingsRatio: candidateTokens ? deferredTokens / candidateTokens : null,
    latencyMs: { mean: mean(latencies), p50: pctl(latencies, 50), p95: pctl(latencies, 95) },
    deferRegretRate: dropCount ? regretCount / dropCount : null,
    regretExamples: regretExamples.slice(0, 20),
    policyVersions: [...new Set(rows.map((r) => r.policyVersion))],
    sieveVersions: [...new Set(rows.map((r) => r.sieveVersion))],
  };
}
