// __tests__/contracts/context-sieve.contract.test.ts
// Slice 6A contracts. Locks the hard exit gates:
//   - shadow mode: production prompt unchanged (projection only)
//   - protected context can never be deferred
//   - missing judgment → KEEP; transport failure → KEEP_ALL; malformed → KEEP
//   - no mutation of inputs; deterministic block IDs; same inputs → same result
//   - attribution fields present

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildContextBlocks,
  sieveShadow,
  SIEVE_DEFER_THRESHOLD,
  type ContextBlock,
  type SieveJudgments,
} from '@/lib/context/sieve';

function blocks(n = 4): ContextBlock[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r1:fact:${i}:f${i}`,
    source: 'fact' as const,
    text: `fact text ${i} ${'x'.repeat(40)}`,
    estimatedTokens: 12,
    protected: false,
    metadata: { index: i },
  }));
}

const ok: SieveJudgments = { relevanceByBlock: {}, transportStatus: 'ok' };

describe('context sieve shadow — slice 6A contracts', () => {
  it('1: shadow evaluation never mutates the block projection inputs', () => {
    const bs = blocks();
    const before = JSON.stringify(bs);
    const judgments: SieveJudgments = {
      relevanceByBlock: { [bs[0].id]: 0.1, [bs[1].id]: 0.9 },
      transportStatus: 'ok',
    };
    sieveShadow(bs, judgments);
    expect(JSON.stringify(bs)).toBe(before);
  });

  it('2: only strong irrelevance defers; uncertain/missing/malformed keep', () => {
    const bs = blocks(3);
    const judgments: SieveJudgments = {
      relevanceByBlock: {
        [bs[0].id]: 0.05,        // strongly irrelevant → DEFER
        [bs[1].id]: 0.5,         // relevant → KEEP
        // bs[2] has no judgment → KEEP
      },
      transportStatus: 'ok',
    };
    const out = sieveShadow(bs, judgments);
    expect(out.deferred.map((b) => b.id)).toEqual([bs[0].id]);
    expect(out.active.map((b) => b.id).sort()).toEqual([bs[1].id, bs[2].id].sort());
    const reasons = Object.fromEntries(out.decisions.map((d) => [d.blockId, d.reasonCode]));
    expect(reasons[bs[0].id]).toBe('strong_irrelevance_defer');
    expect(reasons[bs[2].id]).toBe('no_judgment_keep');
    // Malformed score → KEEP, never defer.
    const bad = sieveShadow(bs, { relevanceByBlock: { [bs[0].id]: Number.NaN }, transportStatus: 'ok' });
    expect(bad.active.length).toBe(3);
    expect(bad.decisions[0].reasonCode).toBe('malformed_score_keep');
    // Out-of-range score → KEEP.
    const oor = sieveShadow(bs, { relevanceByBlock: { [bs[0].id]: 7 }, transportStatus: 'ok' });
    expect(oor.active.length).toBe(3);
  });

  it('3: transport failure or malformed output → KEEP_ALL, deferred empty', () => {
    const bs = blocks();
    for (const status of ['unavailable', 'malformed'] as const) {
      const out = sieveShadow(bs, { relevanceByBlock: { [bs[0].id]: 0.01 }, transportStatus: status });
      expect(out.transportAvailable).toBe(false);
      expect(out.deferred).toHaveLength(0);
      expect(out.active).toHaveLength(bs.length);
      expect(out.activeTokens).toBe(out.originalTokens);
    }
  });

  it('4: protected context can NEVER be deferred — even at relevance 0', () => {
    const protectedBlock: ContextBlock = {
      id: 'r1:document:primary',
      source: 'document',
      text: 'user attached document',
      estimatedTokens: 10,
      protected: true,
      metadata: {},
    };
    const out = sieveShadow([protectedBlock, ...blocks(2)], {
      relevanceByBlock: { 'r1:document:primary': 0.0 },
      transportStatus: 'ok',
    });
    expect(out.deferred).toHaveLength(0);
    const doc = out.decisions.find((d) => d.blockId === 'r1:document:primary')!;
    expect(doc.disposition).toBe('active');
    expect(doc.reasonCode).toBe('protected');
  });

  it('5: block builder is a projection — atomic per retrieval item, protected flags set', () => {
    const input = {
      requestId: 'req-9',
      raw: {
        intelligentFacts: [{ id: 'f1', content: 'fact one' }, { id: 'f2', content: 'fact two' }],
        researchResults: [{ url: 'u', content: 'research snippet' }],
        graphRelatedNodes: [{ name: 'nodeA', summary: 's' }],
        userProfileMemories: [{ id: 'p1', content: 'profile memory' }],
        memorySources: [{ id: 'm1', content: 'memory one' }],
      },
      sections: { attachedDocumentContext: 'DOC', strategyContext: 'STRAT' },
      hasAttachments: true,
    };
    const bs = buildContextBlocks(input);
    // 2 facts + 1 research + 1 graph + 1 profile + 1 memory + 2 protected
    expect(bs).toHaveLength(8);
    expect(bs.filter((b) => b.source === 'fact')).toHaveLength(2);
    const doc = bs.find((b) => b.source === 'document')!;
    const strat = bs.find((b) => b.source === 'strategy')!;
    expect(doc.protected).toBe(true);
    expect(strat.protected).toBe(true);
    expect(bs.every((b) => b.protected === false || b.source === 'document' || b.source === 'strategy')).toBe(true);
    // Deterministic IDs: same input → same IDs.
    expect(buildContextBlocks(input).map((b) => b.id)).toEqual(bs.map((b) => b.id));
  });

  it('6: deterministic and order-stable — same inputs, same fingerprint', () => {
    const bs = blocks(5);
    const j: SieveJudgments = { relevanceByBlock: Object.fromEntries(bs.map((b, i) => [b.id, i % 2 ? 0.9 : 0.05])), transportStatus: 'ok' };
    const a = JSON.stringify(sieveShadow(bs, j));
    const b = JSON.stringify(sieveShadow([...bs], j));
    expect(a).toBe(b);
  });

  it('7: threshold is conservative and exported — defer only below it', () => {
    expect(SIEVE_DEFER_THRESHOLD).toBeLessThanOrEqual(0.3);
    const bs = blocks(2);
    const at = sieveShadow(bs, { relevanceByBlock: { [bs[0].id]: SIEVE_DEFER_THRESHOLD }, transportStatus: 'ok' });
    expect(at.deferred).toHaveLength(0); // boundary is KEEP, not defer
  });

  it('8: module is pure — no I/O, wall-clock, RNG, DB imports', () => {
    const src = readFileSync(join(__dirname, '../../lib/context/sieve.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.now\(\)|Math\.random\(\)|fetch\(|axios|supabaseAdmin|from ['\"]@\/lib\/supabaseClient/);
  });

  it('9: token accounting reconciles — active + deferred == original', () => {
    const bs = blocks(6);
    const j: SieveJudgments = { relevanceByBlock: Object.fromEntries(bs.map((b, i) => [b.id, i < 2 ? 0.05 : 0.9])), transportStatus: 'ok' };
    const out = sieveShadow(bs, j);
    expect(out.activeTokens + out.deferredTokens).toBe(out.originalTokens);
    expect(out.originalBlockCount).toBe(bs.length);
  });
});
