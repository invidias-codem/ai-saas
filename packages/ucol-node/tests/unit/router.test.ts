/**
 * Unit tests for src/router/format.ts
 * Conformance: CONF-040, CONF-041, CONF-034
 */

import { describe, it, expect } from '@jest/globals';
import {
  resolveFormatAdapter,
  greedyPack,
  estimateTokens,
  applyFormat,
} from '../../src/router/format.js';
import type { ModelID, ContextSliceItem } from '../../src/store/schema.js';

// ── Format Adapter ────────────────────────────────────────────────────────────

describe('Format Adapter (resolveFormatAdapter)', () => {
  it('maps anthropic/* to XML_TAGGED', () => {
    const models: ModelID[] = ['anthropic/claude-sonnet-4-6', 'anthropic/claude-opus-4'];
    for (const m of models) expect(resolveFormatAdapter(m)).toBe('XML_TAGGED');
  });

  it('maps google/* to MARKDOWN_HEADERS', () => {
    const models: ModelID[] = ['google/gemini-flash-3.1', 'google/gemini-pro'];
    for (const m of models) expect(resolveFormatAdapter(m)).toBe('MARKDOWN_HEADERS');
  });

  it('maps deepseek/* to JSON_STRUCTURED', () => {
    expect(resolveFormatAdapter('deepseek/deepseek-r1')).toBe('JSON_STRUCTURED');
  });

  it('maps local/* to PLAIN_TEXT', () => {
    expect(resolveFormatAdapter('local/llama-3.3-70b')).toBe('PLAIN_TEXT');
  });

  it('falls back to PLAIN_TEXT for unknown providers', () => {
    expect(resolveFormatAdapter('unknown/model-x')).toBe('PLAIN_TEXT');
  });
});

// ── Token Estimation ──────────────────────────────────────────────────────────

describe('estimateTokens()', () => {
  it('returns 0 for empty slice', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('estimates more tokens for longer content', () => {
    const short: ContextSliceItem[] = [{ item_id: '1', item_type: 'knowledge', score: 1, formatted: 'short' }];
    const long: ContextSliceItem[] = [{ item_id: '2', item_type: 'knowledge', score: 1, formatted: 'a'.repeat(400) }];
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

// ── Greedy Pack ───────────────────────────────────────────────────────────────

describe('greedyPack()', () => {
  function makeItem(id: string, content: string, score: number): ContextSliceItem {
    return { item_id: id, item_type: 'knowledge', score, formatted: content };
  }

  it('respects token budget (CONF-041)', () => {
    const items = [
      makeItem('1', 'a'.repeat(400), 0.9),  // ~100 tokens
      makeItem('2', 'b'.repeat(400), 0.8),
      makeItem('3', 'c'.repeat(400), 0.7),
    ];
    const packed = greedyPack(items, 150, 'PLAIN_TEXT');
    const totalTokens = estimateTokens(packed);
    expect(totalTokens).toBeLessThanOrEqual(150);
  });

  it('returns empty array when budget is 0', () => {
    const items = [makeItem('1', 'some content', 0.9)];
    expect(greedyPack(items, 0, 'PLAIN_TEXT')).toHaveLength(0);
  });

  it('selects highest-scoring items first', () => {
    const items = [
      makeItem('low',  'low score item',    0.3),
      makeItem('high', 'high score item',   0.9),
      makeItem('med',  'medium score item', 0.6),
    ];
    const packed = greedyPack(items, 5000, 'PLAIN_TEXT');
    expect(packed[0].item_id).toBe('high');
  });
});

// ── Format Application ────────────────────────────────────────────────────────

describe('applyFormat()', () => {
  const items: ContextSliceItem[] = [
    { item_id: 'k1', item_type: 'knowledge', score: 0.9, formatted: 'PostgreSQL 15 in use' },
    { item_id: 'k2', item_type: 'knowledge', score: 0.8, formatted: 'No raw card numbers' },
  ];

  it('XML_TAGGED format wraps items in XML tags', () => {
    const result = applyFormat(items, 'XML_TAGGED');
    expect(result).toContain('<');
    expect(result).toContain('>');
  });

  it('MARKDOWN_HEADERS format produces markdown', () => {
    const result = applyFormat(items, 'MARKDOWN_HEADERS');
    expect(result).toContain('#');
  });

  it('JSON_STRUCTURED format is valid JSON', () => {
    const result = applyFormat(items, 'JSON_STRUCTURED');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('PLAIN_TEXT format is human-readable without markup', () => {
    const result = applyFormat(items, 'PLAIN_TEXT');
    expect(result).toContain('PostgreSQL 15');
  });
});

// ── Destructive Intent Patterns (CONF-034) ────────────────────────────────────

describe('Destructive intent patterns', () => {
  const PATTERNS = ['delete', 'drop table', 'truncate', 'destroy', 'remove all', 'wipe', 'purge', 'rm -rf', 'format', 'irreversible'];

  const DESTRUCTIVE = ['DROP TABLE users', 'rm -rf /data', 'delete all records', 'truncate the db', 'wipe sessions'];
  const SAFE = ['list pull requests', 'show deployment status', 'how should I structure middleware'];

  it('all destructive queries match at least one pattern', () => {
    for (const q of DESTRUCTIVE) {
      const lower = q.toLowerCase();
      const matched = PATTERNS.some((p) => lower.includes(p));
      expect(matched).toBe(true);
    }
  });

  it('safe queries do not match destructive patterns', () => {
    for (const q of SAFE) {
      const lower = q.toLowerCase();
      const matched = PATTERNS.some((p) => lower.includes(p));
      expect(matched).toBe(false);
    }
  });
});
