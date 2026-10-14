/**
 * Memory idempotency contract — storeMemory dedup on operationKey.
 *
 * Locks that a replayed memory write with the same deterministic operationKey
 * produces ONE effective logical mutation (returns the extant id on unique
 * violation), and that a write without a key is unaffected (legacy behavior).
 *
 * PARKED (2026-10-12): contract-first stub for an unimplemented feature.
 * storeMemory currently has NO operationKey support (no MemoryWriteOptions
 * field, no operation_key column/constraint in workspace_memories, no
 * call sites pass a key). This is the acceptance contract for that feature
 * slice — do NOT ship into __tests__/contracts/ until the implementation
 * lands (the suite must not run red in CI). Reconciliation finding recorded
 * in lib/vdi/RELEASE_ACTIVATION.md (Housekeeping section).
 */
import { storeMemory } from '@/lib/memory/vectorStore';

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));
jest.mock('@/lib/memory/embedding', () => ({
  generateEmbeddingWithMetadata: jest.fn(async () => ({ vector: [], dimension: 768, provider: 'mock', model: 'mock' })),
}));

function getSupabase() {
  return require('@/lib/supabaseClient').supabase as any;
}

describe('storeMemory — idempotent memory write (Phase 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes operation_key into the insert payload when provided', async () => {
    const insert = jest.fn().mockReturnThis();
    const select = jest.fn().mockReturnThis();
    const single = jest.fn(async () => ({ data: { id: 'mem_1' }, error: null }));
    getSupabase().from.mockImplementation(() => ({
      insert,
      select,
      single,
      eq: jest.fn().mockReturnThis(),
    }));

    await storeMemory('user_1', 'a memory', 'fact', {}, { operationKey: 'memory:conv_1:vector-store:v1' });
    const payload = insert.mock.calls[0][0];
    expect(payload.operation_key).toBe('memory:conv_1:vector-store:v1');
  });

  it('returns the extant memory id on unique(operation_key) replay (no duplicate)', async () => {
    const insert = jest.fn(() => {
      const err = new Error('duplicate key value violates unique constraint "uq_workspace_memories_operation_key"');
      return {
        select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: err.message } }) }),
      };
    });
    const select = jest.fn(() => ({
      eq: jest.fn().mockReturnThis({
        limit: jest.fn(async () => ({ data: [{ id: 'mem_extant' }], error: null })),
      }),
    }));
    getSupabase().from.mockImplementation((table: string) => (table === 'workspace_memories' ? { insert, select } : {}));

    const result = await storeMemory('user_1', 'a memory', 'fact', {}, { operationKey: 'memory:conv_1:vector-store:v1' });
    expect(result && (result as { id?: string }).id).toBe('mem_extant');
  });

  it('legacy writes without an operation key are unaffected', async () => {
    const insert = jest.fn().mockReturnThis();
    const select = jest.fn().mockReturnThis();
    const single = jest.fn(async () => ({ data: { id: 'mem_2' }, error: null }));
    getSupabase().from.mockImplementation(() => ({ insert, select, single, eq: jest.fn().mockReturnThis() }));

    await storeMemory('user_1', 'a memory', 'fact', {});
    const payload = insert.mock.calls[0][0];
    expect(payload.operation_key).toBeUndefined();
  });
});
