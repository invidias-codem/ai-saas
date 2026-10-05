// __tests__/contracts/context-sieve-dataset.contract.test.ts
// 6A.1 dataset contracts — the five invariants required before 6B:
//   1. every request gets exactly one request-summary event, including failures
//   2. every candidate block gets a deterministic blockId and one outcome row
//   3. the summary reconciles exactly against the block-level rows
//   4. protected strategy/document blocks are never projected as droppable
//   5. any exception/failure resolves to KEEP_ALL with a recorded reason
// Plus: schema completeness (hashes, versions, failOpen) and determinism.

import {
  buildContextBlocks,
  buildFailOpenSummary,
  buildSieveEvents,
  sieveShadow,
  type ContextBlock,
} from '@/lib/context/sieve';

function blocks(n = 4): ContextBlock[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r1:fact:${i}:f${i}`,
    source: 'fact' as const,
    text: `fact text ${i} ${'y'.repeat(40)}`,
    estimatedTokens: 12,
    protected: false,
    metadata: { index: i },
  }));
}

const NOW = '2026-10-05T10:00:00Z';

describe('context sieve dataset — 6A.1 contracts', () => {
  it('1: exactly one request-summary row per evaluation', () => {
    const bs = blocks(5);
    const sieved = sieveShadow(bs, { relevanceByBlock: { [bs[0].id]: 0.05 }, transportStatus: 'ok' });
    const rows = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 3, createdAt: NOW });
    const summaries = rows.filter((r) => r.isSummary);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].blockId).toBe('__request__');
    expect(summaries[0].blockType).toBe('request_summary');
  });

  it('2: every candidate block gets exactly one row with its deterministic blockId', () => {
    const bs = blocks(6);
    const sieved = sieveShadow(bs, { relevanceByBlock: {}, transportStatus: 'ok' });
    const rows = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 1, createdAt: NOW });
    const blockRows = rows.filter((r) => !r.isSummary);
    expect(blockRows).toHaveLength(bs.length);
    const ids = new Set(blockRows.map((r) => r.blockId));
    expect(ids.size).toBe(bs.length); // no dupes, none missing
    for (const b of bs) expect(ids.has(b.id)).toBe(true);
    // Deterministic: same inputs → same rows.
    const again = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 1, createdAt: NOW });
    expect(JSON.stringify(again)).toBe(JSON.stringify(rows));
  });

  it('3: the summary reconciles exactly against the block rows', () => {
    const bs = blocks(8);
    const j = Object.fromEntries(bs.map((b, i) => [b.id, i < 3 ? 0.05 : 0.9]));
    const sieved = sieveShadow(bs, { relevanceByBlock: j, transportStatus: 'ok' });
    const rows = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 2, createdAt: NOW });
    const summary = rows.find((r) => r.isSummary)!;
    const blockRows = rows.filter((r) => !r.isSummary);

    expect(summary.blocksConsidered).toBe(blockRows.length);
    expect(summary.blocksDeferred).toBe(blockRows.filter((r) => r.decision === 'DROP').length);
    // Token reconciliation: candidate == sum of block rows; deferred == sum of DROP rows.
    expect(summary.candidateTokens).toBe(blockRows.reduce((a, r) => a + r.estimatedTokens, 0));
    expect(summary.proposedDeferredTokens).toBe(blockRows.filter((r) => r.decision === 'DROP').reduce((a, r) => a + r.estimatedTokens, 0));
    expect(summary.proposedActiveTokens).toBe(blockRows.filter((r) => r.decision === 'KEEP').reduce((a, r) => a + r.estimatedTokens, 0));
    expect(summary.proposedReductionRatio).toBeCloseTo(
      (summary.proposedDeferredTokens ?? 0) / (summary.candidateTokens ?? 1),
      10,
    );
    // Every block row shares the request's inputHash.
    expect(new Set(rows.map((r) => r.inputHash)).size).toBe(1);
  });

  it('4: protected blocks are never projected as droppable — even in rows', () => {
    const input = {
      requestId: 'req-p',
      raw: { intelligentFacts: [{ id: 'f1', content: 'fact' }] },
      sections: { attachedDocumentContext: 'USER DOC', strategyContext: 'STRATEGY' },
      hasAttachments: true,
    };
    const bs = buildContextBlocks(input);
    // Force maximal irrelevance including protected blocks.
    const j = Object.fromEntries(bs.map((b) => [b.id, 0.0]));
    const sieved = sieveShadow(bs, { relevanceByBlock: j, transportStatus: 'ok' });
    const rows = buildSieveEvents({ requestId: 'req-p', blocks: bs, sieved, latencyMs: 1, createdAt: NOW });
    for (const r of rows.filter((x) => !x.isSummary)) {
      if (r.protected) {
        expect(r.decision).toBe('KEEP');
        expect(r.reason).toBe('protected');
      }
    }
    const protectedDrops = rows.filter((r) => r.protected && r.decision === 'DROP');
    expect(protectedDrops).toHaveLength(0);
  });

  it('5: failures fail open — exception path still emits exactly one failOpen summary with a reason', () => {
    const row = buildFailOpenSummary({ requestId: 'r9', reason: 'exception', latencyMs: 7, createdAt: NOW, message: 'boom' });
    expect(row.isSummary).toBe(true);
    expect(row.failOpen).toBe(true);
    expect(row.decision).toBeNull();
    expect(row.reason).toContain('fail_open:exception');
    expect(row.blocksDeferred).toBe(0);
    expect(row.proposedDeferredTokens).toBe(0);
    // Transport-failure path inside sieveShadow also yields a failOpen summary.
    const bs = blocks(3);
    const sieved = sieveShadow(bs, { relevanceByBlock: {}, transportStatus: 'malformed' });
    const rows = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 1, createdAt: NOW });
    const summary = rows.find((r) => r.isSummary)!;
    expect(summary.failOpen).toBe(true);
    expect(summary.reason).toBe('fail_open_keep_all');
    expect(rows.filter((r) => r.decision === 'DROP')).toHaveLength(0);
  });

  it('6: schema completeness — hashes, versions, failOpen on every row', () => {
    const bs = blocks(3);
    const sieved = sieveShadow(bs, { relevanceByBlock: {}, transportStatus: 'ok' });
    const rows = buildSieveEvents({ requestId: 'r1', blocks: bs, sieved, latencyMs: 4, createdAt: NOW });
    for (const r of rows) {
      expect(typeof r.inputHash).toBe('string');
      expect(r.inputHash.length).toBeGreaterThan(0);
      expect(typeof r.blockHash).toBe('string');
      expect(typeof r.policyVersion).toBe('string');
      expect(typeof r.sieveVersion).toBe('string');
      expect(typeof r.failOpen).toBe('boolean');
      expect(typeof r.createdAt).toBe('string');
    }
    // Same block content → same blockHash across requests (provenance).
    const b1 = buildContextBlocks({ requestId: 'a', raw: { intelligentFacts: [{ id: 'f', content: 'same text' }] }, sections: {}, hasAttachments: false });
    const b2 = buildContextBlocks({ requestId: 'b', raw: { intelligentFacts: [{ id: 'f', content: 'same text' }] }, sections: {}, hasAttachments: false });
    // IDs embed the requestId; content hashes must still match.
    const { blockHashOf } = require('@/lib/context/sieve');
    expect(blockHashOf(b1[0])).toBe(blockHashOf(b2[0]));
  });
});
