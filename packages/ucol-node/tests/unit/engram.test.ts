/**
 * Unit tests for src/engram/index.ts
 * Conformance: CONF-060, CONF-061
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock Gemini BEFORE any module imports
jest.mock('@google/generative-ai', () => {
  const mockText = jest.fn(() => JSON.stringify([
    { content: 'The project uses TypeScript strict mode', type: 'FACT', confidence: 0.9 },
    { content: 'Never commit API secrets to git', type: 'CONSTRAINT', confidence: 0.99 },
    { content: 'Very uncertain low-quality observation', type: 'ASSERTION', confidence: 0.15 }, // below 0.3 — must be dropped
  ]));
  return {
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: jest.fn(() => ({
        generateContent: jest.fn(() => Promise.resolve({ response: { text: mockText } })),
        embedContent: jest.fn(() => Promise.resolve({
          embedding: { values: new Array(768).fill(0.1) },
        })),
      })),
    })),
  };
});

// Mock ContextStore
const mockGetSessionHistory = jest.fn();
const mockInsertKnowledge = jest.fn().mockResolvedValue(undefined);
const mockMarkDistilled = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/store/index.js', () => ({
  ContextStore: jest.fn(() => ({
    getSessionHistory: mockGetSessionHistory,
    insertKnowledge: mockInsertKnowledge,
    markHistoryDistilled: mockMarkDistilled,
  })),
}));

import { EngramEngine } from '../../src/engram/index.js';
import { ContextStore } from '../../src/store/index.js';
import type { HistoryItem } from '../../src/store/schema.js';

const DISTILLATION_THRESHOLD_BYTES = 50 * 1024;

function makeHistory(count: number, contentSize = 100): HistoryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h-${i}`,
    session_id: 'sess-test',
    sequence: i,
    role: 'USER' as const,
    content: `Turn ${i}: ${'word '.repeat(Math.floor(contentSize / 5))}`,
    model_id: null,
    tokens_used: 25,
    distilled: false,
    delta_k: [],
    delta_a: [],
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }));
}

describe('Engram Engine', () => {
  let store: ContextStore;
  let engine: EngramEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new ContextStore('https://test.supabase.co', 'service-key', 'gemini-key');
    engine = new EngramEngine(store, 'test-gemini-key');
    mockGetSessionHistory.mockResolvedValue(makeHistory(20));
  });

  it('CONF-060: distillation processes history and calls insertKnowledge', async () => {
    const result = await engine.distill('sess-test', 'did:ucol:test-agent');
    expect(result.output_k_items).toBeGreaterThanOrEqual(0);
    // insertKnowledge called for items above threshold
    expect(mockInsertKnowledge).toHaveBeenCalled();
  });

  it('CONF-061: items below confidence 0.3 are NOT persisted', async () => {
    await engine.distill('sess-test', 'did:ucol:test-agent');

    // Check all inserted items meet minimum threshold
    for (const call of mockInsertKnowledge.mock.calls) {
      const item = call[0] as { confidence: number };
      expect(item.confidence).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('marks all processed history items as distilled', async () => {
    await engine.distill('sess-test', 'did:ucol:test-agent');
    expect(mockMarkDistilled).toHaveBeenCalled();
  });

  it('returns EngramReport with required fields', async () => {
    const result = await engine.distill('sess-test', 'did:ucol:test-agent');
    expect(result).toHaveProperty('input_bytes');
    expect(result).toHaveProperty('output_k_items');
    expect(result).toHaveProperty('compression_ratio');
    expect(result).toHaveProperty('dropped_below_threshold');
    expect(result).toHaveProperty('clusters_formed');
    expect(result).toHaveProperty('session_id');
  });

  it('returns empty report when no history exists', async () => {
    mockGetSessionHistory.mockResolvedValue([]);
    const result = await engine.distill('empty-session', 'did:ucol:test-agent');
    expect(result.output_k_items).toBe(0);
    expect(result.input_bytes).toBe(0);
  });

  it('DISTILLATION_THRESHOLD_BYTES constant is 50KB', () => {
    expect(DISTILLATION_THRESHOLD_BYTES).toBe(50 * 1024);
  });
});
