// __tests__/contracts/context-sieve-calibration.contract.test.ts
// 6A.2 contracts: the calibration harness itself must be trustworthy.
//   - dataset-integrity diagnostics detect every 6A.1 violation class
//   - defer_regret_rate counts DROP blocks later re-needed (same request)
//   - protected DROP is surfaced as a violation, not averaged away
//   - empty dataset → nulls, never zero-division
//   - purity + determinism

import { readFileSync } from 'fs';
import { join } from 'path';
import { calibrateSieve, type SieveEventRow } from '@/lib/context/sieve-calibration';

function block(over: Partial<SieveEventRow> = {}): SieveEventRow {
  return {
    requestId: 'r1',
    blockId: 'b1',
    blockType: 'fact',
    decision: 'KEEP',
    reason: 'relevant_keep',
    relevanceScore: 0.9,
    protected: false,
    failOpen: false,
    policyVersion: '1',
    sieveVersion: 'context-sieve-shadow-v1',
    inputHash: 'ih',
    blockHash: 'bh1',
    latencyMs: 3,
    createdAt: '2026-10-05T10:00:00Z',
    estimatedTokens: 10,
    isSummary: false,
    ...over,
  };
}

function summary(over: Partial<SieveEventRow> = {}): SieveEventRow {
  return {
    ...block({ blockId: '__request__', blockType: 'request_summary', decision: null, relevanceScore: null, isSummary: true }),
    candidateTokens: 20,
    proposedActiveTokens: 20,
    proposedDeferredTokens: 0,
    proposedReductionRatio: 0,
    blocksConsidered: 2,
    blocksDeferred: 0,
    ...over,
  };
}

describe('context sieve calibration — 6A.2 contracts', () => {
  it('1: clean dataset passes integrity diagnostics', () => {
    const rows = [
      summary(),
      block({ blockId: 'b1', blockHash: 'h1', estimatedTokens: 10 }),
      block({ blockId: 'b2', blockHash: 'h2', estimatedTokens: 10 }),
    ];
    const r = calibrateSieve(rows);
    expect(r.diagnostics).toEqual({
      requestRows: 1, blockRows: 2, requestsMissingSummary: 0, duplicateSummaries: 0,
      reconciliationFailures: 0, protectedDropRows: 0, malformedRows: 0,
    });
    expect(r.requests).toBe(1);
    expect(r.blocksConsidered).toBe(2);
    expect(r.overallDeferRate).toBe(0);
  });

  it('2: integrity violations are all detected', () => {
    // missing summary
    const noSummary = [block({ blockId: 'b1' }), block({ blockId: 'b2' })];
    expect(calibrateSieve(noSummary).diagnostics.requestsMissingSummary).toBe(1);
    // duplicate summaries
    const dup = [summary(), summary(), block()];
    expect(calibrateSieve(dup).diagnostics.duplicateSummaries).toBe(1);
    // reconciliation failure: summary claims 5 blocks, only 1 present
    const recon = [summary({ blocksConsidered: 5, blocksDeferred: 2 }), block()];
    expect(calibrateSieve(recon).diagnostics.reconciliationFailures).toBeGreaterThanOrEqual(1);
    // protected DROP — the sacred violation
    const prot = [summary(), block({ protected: true, decision: 'DROP', reason: 'should_not_happen' })];
    const r = calibrateSieve(prot);
    expect(r.diagnostics.protectedDropRows).toBe(1);
    expect(r.protectedInterventionCount).toBe(1);
    // malformed row
    const mal = calibrateSieve([summary(), block(), { ...block(), requestId: undefined as unknown as string }]);
    expect(mal.diagnostics.malformedRows).toBe(1);
  });

  it('3: defer_regret_rate counts DROP blocks whose hash reappears as KEEP in the same request', () => {
    const rows = [
      summary({ blocksConsidered: 3, blocksDeferred: 1, candidateTokens: 30, proposedDeferredTokens: 10, proposedActiveTokens: 20 }),
      block({ blockId: 'd1', blockHash: 'REGRETTED', decision: 'DROP', relevanceScore: 0.05 }),
      block({ blockId: 'k1', blockHash: 'FINE', decision: 'KEEP' }),
      block({ blockId: 'k2', blockHash: 'REGRETTED', decision: 'KEEP', reason: 're_retrieved' }),
    ];
    const r = calibrateSieve(rows);
    expect(r.deferRegretRate).toBe(1); // the single DROP was later needed
    expect(r.regretExamples).toHaveLength(1);
    expect(r.regretExamples[0].blockHash).toBe('REGRETTED');
    // and a clean drop set yields 0
    const clean = [
      summary({ blocksConsidered: 2, blocksDeferred: 1, candidateTokens: 20, proposedDeferredTokens: 10, proposedActiveTokens: 10 }),
      block({ blockId: 'd1', blockHash: 'GONE', decision: 'DROP' }),
      block({ blockId: 'k1', blockHash: 'OK', decision: 'KEEP' }),
    ];
    expect(calibrateSieve(clean).deferRegretRate).toBe(0);
  });

  it('4: empty dataset → nulls, never NaN', () => {
    const r = calibrateSieve([]);
    expect(r.requests).toBe(0);
    expect(r.overallDeferRate).toBeNull();
    expect(r.keepAllRate).toBeNull();
    expect(r.deferRegretRate).toBeNull();
    expect(r.proposedTokenSavingsRatio).toBeNull();
    expect(r.latencyMs.mean).toBeNull();
  });

  it('5: buckets compute per-source drop rates and relevance bands', () => {
    const rows = [
      summary({ blocksConsidered: 4, blocksDeferred: 2 }),
      block({ blockType: 'fact', decision: 'DROP', relevanceScore: 0.05, estimatedTokens: 10 }),
      block({ blockType: 'fact', decision: 'KEEP', relevanceScore: 0.9, estimatedTokens: 10 }),
      block({ blockType: 'research', decision: 'DROP', relevanceScore: 0.02, estimatedTokens: 10 }),
      block({ blockType: 'graph', decision: 'KEEP', relevanceScore: null, estimatedTokens: 10 }),
    ];
    const r = calibrateSieve(rows);
    expect(r.bySource.fact.dropRate).toBeCloseTo(0.5, 10);
    expect(r.bySource.research.dropRate).toBe(1);
    expect(r.bySource.graph.dropRate).toBe(0);
    expect(r.byRelevanceBand['0.00-0.10'].total).toBe(2);
    expect(r.byRelevanceBand.no_judgment.total).toBe(1);
    expect(r.overallDeferRate).toBeCloseTo(0.5, 10);
  });

  it('6: module is pure and deterministic', () => {
    const src = readFileSync(join(__dirname, '../../lib/context/sieve-calibration.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)|fetch\(|axios|supabaseAdmin|from ['\"]@\/lib\/supabaseClient/);
    const rows = [summary(), block(), block({ blockId: 'b2', blockHash: 'h2' })];
    expect(JSON.stringify(calibrateSieve(rows))).toBe(JSON.stringify(calibrateSieve(rows)));
  });
});
