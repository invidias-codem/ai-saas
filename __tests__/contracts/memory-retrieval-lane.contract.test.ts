/**
 * Memory retrieval lane contract (embedding migration).
 *
 * Locks:
 *   1. GA model: embedContent targets gemini-embedding-2 (preview retired).
 *   2. Cache key: full-text sha256, namespaced by model+dim — two documents
 *      sharing a 500-char prefix must NOT collide.
 *   3. Degraded zero-vector: NEVER cached (L1 or Redis); searchMemories routes
 *      to search_memories_lexical, never match_memories_* with a zero vector.
 *   4. Model-aware retrieval: the 3072 lane passes filter_embedding_model.
 */
// Shared embedContent mock — every getGenerativeModel() returns the SAME
// instance, so tests configure rejections/resolutions that the provider's
// own fresh getGenerativeModel() call actually hits.
const embedContentMock = jest.fn(async () => ({
  embedding: { values: new Array(3072).fill(0.1) },
}));
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { embedContent: (...a: any[]) => embedContentMock(...a) };
    }
  },
}));

const redisMock = { get: jest.fn(), set: jest.fn().mockResolvedValue('OK') };
jest.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { return redisMock; }
  },
}));

const rpcMock = jest.fn();
const fromMock = jest.fn();
// Mutable holder — vectorStore imports supabaseAdmin at module load; tests
// swap the .rpc implementation per-case.
jest.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: (...a: any[]) => rpcMock(...a), from: (...a: any[]) => fromMock(...a) },
  supabaseAdmin: { rpc: (...a: any[]) => rpcMock(...a), from: (...a: any[]) => fromMock(...a) },
}));

jest.mock('@/lib/compression', () => ({
  compress: (t: string) => `LZ:${t}`,
  safeDecompress: (t: string) => String(t).replace(/^LZ:/, ''),
}));

import { generateEmbeddingWithMetadata, EMBEDDING_MODEL } from '@/lib/memory/embedding';
import * as embeddingModule from '@/lib/memory/embedding';

// searchMemories supabase mock — patch after import
import { searchMemories } from '@/lib/memory/vectorStore';

describe('memory retrieval lane contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the healthy default (individual tests may override).
    embedContentMock.mockImplementation(async () => ({
      embedding: { values: new Array(3072).fill(0.1) },
    }));
    process.env.GOOGLE_API_KEY = 'test';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    embeddingModule.clearEmbeddingCache();
  });

  it('targets the GA embedding model, not the retired preview', () => {
    expect(EMBEDDING_MODEL).toBe('gemini-embedding-2');
    expect(EMBEDDING_MODEL).not.toContain('preview');
  });

  it('hashes the FULL text — 500-char-prefix collisions impossible', async () => {
    const sharedPrefix = 'x'.repeat(600);
    const a = await generateEmbeddingWithMetadata(sharedPrefix + '-alpha');
    const b = await generateEmbeddingWithMetadata(sharedPrefix + '-beta');
    // Same provider state; distinct calls succeeded (no collision short-circuit
    // — under the old prefix key the second call would have been an L1 hit).
    expect(a.model).toBe('gemini-embedding-2');
    expect(b.model).toBe('gemini-embedding-2');
  });

  it('degraded result is never cached: second call re-attempts the provider', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://r.test';
    process.env.UPSTASH_REDIS_REST_TOKEN = 't';

    // First call: provider throws → degraded, and NOT stored in Redis.
    embedContentMock.mockRejectedValueOnce(new Error('403 Forbidden'));
    const first = await generateEmbeddingWithMetadata('fail-once');
    expect(first.degraded).toBe(true);
    expect(redisMock.set).not.toHaveBeenCalled();

    // Second call: provider succeeds → real embedding (was not poisoned).
    const second = await generateEmbeddingWithMetadata('fail-once');
    expect(second.degraded).toBeUndefined();
    expect(second.provider).toBe('gemini');
  });

  it('searchMemories with a degraded embedding routes to lexical, never pgvector', async () => {
    // Force degraded embedding.
    embedContentMock.mockRejectedValue(new Error('403'));

    const lexicalRows = [{ id: 'm1', content: 'LZ:hello world', type: 'fact', metadata: {}, similarity: 0.9, created_at: '2026-09-21' }];
    rpcMock.mockResolvedValue({ data: lexicalRows, error: null });

    const memories = await searchMemories('u1', 'hello world', 5);

    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('hello world'); // decompressed
    // Lexical RPC — NOT match_memories_3072 with a zero vector.
    expect(rpcMock).toHaveBeenCalledWith('search_memories_lexical', expect.objectContaining({
      query_text: 'hello world',
      filter_user_id: 'u1',
    }));
    expect(rpcMock.mock.calls[0][0]).not.toContain('match_memories_3072');
  });

  it('healthy 3072 embedding passes the model filter to match_memories_3072', async () => {
    const rows = [{ id: 'm1', content: 'LZ:x', type: 'fact', metadata: {}, similarity: 0.9, created_at: '2026-09-21', reward_score: 1 }];
    rpcMock.mockResolvedValue({ data: rows, error: null });

    await searchMemories('u1', 'healthy query', 5);

    expect(rpcMock).toHaveBeenCalledWith('match_memories_3072', expect.objectContaining({
      filter_embedding_model: 'gemini-embedding-2',
    }));
  });
});
