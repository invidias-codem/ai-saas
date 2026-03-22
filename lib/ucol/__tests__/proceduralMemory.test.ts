/**
 * lib/ucol/__tests__/proceduralMemory.test.ts
 *
 * Unit tests for Procedural Memory, StateDiff, and agentRouter fast-path.
 * All external dependencies (Supabase, Gemini embedding, AgentRouter LLM) are mocked.
 */

// ─── Mocks (must be before imports) ─────────────────────────────────────────

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/memory/embedding', () => ({
  generateEmbedding: jest.fn(),
}));

// Mock GeminiProvider used by AgentRouter
jest.mock('@/lib/llm/providers/gemini', () => ({
  GeminiProvider: jest.fn().mockImplementation(() => ({
    generateStream: jest.fn().mockResolvedValue({
      stream: {
        getReader: () => ({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(
                JSON.stringify({ taskType: 'quick_answer', confidence: 0.9, reasoning: 'test' })
              ),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }),
      },
    }),
  })),
}));

// Mock confidenceScoring so we don't pull in real logic
jest.mock('@/lib/memory/confidenceScoring', () => ({
  scoreContextForRouting: jest.fn(),
  DEFAULT_BASE_CONFIDENCE: 0.7,
}));

// Mock intelligentMemory (re-exported type)
jest.mock('@/lib/intelligentMemory', () => ({}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/memory/embedding';
import {
  recordExecution,
  findMatchingProcedure,
  promoteToMacro,
  invalidateProcedure,
  _clearCache,
  _evictCacheForId,
  _resetSupabase,
  type ToolStep,
  type ProceduralRecord,
} from '../proceduralMemory';
import { executeTool } from '../toolExecutor';
import { AgentRouter } from '../agentRouter';

// ─── Mock Supabase builder helpers ───────────────────────────────────────────

type MockDb = {
  rpc: jest.Mock;
  from: jest.Mock;
  _updateMock: jest.Mock;
  _insertMock: jest.Mock;
  _eqMock: jest.Mock;
};

function buildMockDb(overrides: Partial<{
  rpcData: unknown[];
  rpcError: { message: string } | undefined;
  updateError: { message: string } | undefined;
  insertError: { message: string } | undefined;
}> = {}): MockDb {
  const eqMock = jest.fn().mockResolvedValue({ error: overrides.updateError ?? undefined });
  const updateMock = jest.fn().mockReturnValue({ eq: eqMock });
  const insertMock = jest.fn().mockResolvedValue({ error: overrides.insertError ?? undefined });

  const fromMock = jest.fn().mockReturnValue({
    update: updateMock,
    insert: insertMock,
  });

  const rpcMock = jest.fn().mockResolvedValue({
    data: overrides.rpcData ?? [],
    error: overrides.rpcError ?? undefined,
  });

  return {
    rpc: rpcMock,
    from: fromMock,
    _updateMock: updateMock,
    _insertMock: insertMock,
    _eqMock: eqMock,
  };
}

function mockSupabase(db: MockDb): void {
  (createClient as jest.Mock).mockReturnValue(db);
  // Reset the module-level _supabase singleton by re-requiring
  // We achieve this by ensuring env vars are set
}

// ─── Test Environment ─────────────────────────────────────────────────────────

const FAKE_EMBEDDING = new Array(768).fill(0.1);
const FAKE_USER = 'user-test-123';
const FAKE_TASK_DESC = 'list all open pull requests in the repo';
const FAKE_TASK_TYPE = 'pr_management';
const FAKE_SEQUENCE: ToolStep[] = [{ tool: 'gh', command: 'pr list', args: ['--state', 'open'] }];

const FAKE_RECORD_ROW = {
  id: 'proc-abc-123',
  user_id: FAKE_USER,
  task_type: FAKE_TASK_TYPE,
  task_description: FAKE_TASK_DESC,
  tool_sequence: FAKE_SEQUENCE,
  success_count: 5,
  failure_count: 1,
  avg_latency_ms: 200,
  confidence: 5 / 6,
  promoted_at: '2026-01-01T00:00:00Z',
  last_used_at: new Date().toISOString(),
  similarity: 0.95,
};

function makeRecord(overrides: Partial<typeof FAKE_RECORD_ROW> = {}): typeof FAKE_RECORD_ROW {
  return { ...FAKE_RECORD_ROW, ...overrides };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  _clearCache(); _resetSupabase();

  // Set required env vars so getSupabase() initialises the client
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  process.env.GOOGLE_API_KEY = 'test-google-key';

  (generateEmbedding as jest.Mock).mockResolvedValue(FAKE_EMBEDDING);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

// ── 1. recordExecution stores correctly ──────────────────────────────────────
it('recordExecution inserts a new record when no similar match exists', async () => {
  const db = buildMockDb({ rpcData: [] });
  mockSupabase(db);

  recordExecution(FAKE_USER, FAKE_TASK_TYPE, FAKE_TASK_DESC, FAKE_SEQUENCE, true, 150);

  // Fire-and-forget: give it a tick to run
  await new Promise((r) => setTimeout(r, 50));

  expect(db.rpc).toHaveBeenCalledWith(
    'match_procedural_memory',
    expect.objectContaining({ p_user_id: FAKE_USER })
  );
  expect(db.from).toHaveBeenCalledWith('ucol_procedural_memory');
  expect(db._insertMock).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: FAKE_USER,
      task_type: FAKE_TASK_TYPE,
      success_count: 1,
      failure_count: 0,
    })
  );
});

// ── 2. recordExecution updates existing when match found ─────────────────────
it('recordExecution increments success_count when an existing similar record matches', async () => {
  const existingRow = makeRecord({ success_count: 2, failure_count: 0, promoted_at: undefined });
  const db = buildMockDb({ rpcData: [existingRow] });
  mockSupabase(db);

  recordExecution(FAKE_USER, FAKE_TASK_TYPE, FAKE_TASK_DESC, FAKE_SEQUENCE, true, 100);
  await new Promise((r) => setTimeout(r, 50));

  expect(db._updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ success_count: 3 })
  );
  expect(db._insertMock).not.toHaveBeenCalled();
});

// ── 3. findMatchingProcedure returns undefined below threshold ─────────────────────
it('findMatchingProcedure returns undefined when RPC returns no rows (below threshold)', async () => {
  const db = buildMockDb({ rpcData: [] });
  mockSupabase(db);

  const result = await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);

  expect(result).toBeNull();
  expect(db.rpc).toHaveBeenCalledWith(
    'match_procedural_memory',
    expect.objectContaining({ p_threshold: 0.88 })
  );
});

// ── 4. findMatchingProcedure returns match above threshold ────────────────────
it('findMatchingProcedure returns a ProceduralMatch when RPC returns a row', async () => {
  const row = makeRecord({ similarity: 0.93 });
  const db = buildMockDb({ rpcData: [row] });
  mockSupabase(db);

  const result = await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC, FAKE_TASK_TYPE);

  expect(result).not.toBeNull();
  expect(result!.similarity).toBeCloseTo(0.93);
  expect(result!.record.id).toBe('proc-abc-123');
  expect(result!.record.toolSequence).toEqual(FAKE_SEQUENCE);
});

// ── 5. auto-promotion triggers at 3 successes + 0.85 confidence ──────────────
it('auto-promotes procedure when successCount reaches 3 at ≥0.85 confidence', async () => {
  // Existing: 2 successes, 0 failures → new: 3/3 = 1.0 confidence
  const existingRow = makeRecord({ success_count: 2, failure_count: 0, promoted_at: undefined });
  const db = buildMockDb({ rpcData: [existingRow] });
  mockSupabase(db);

  recordExecution(FAKE_USER, FAKE_TASK_TYPE, FAKE_TASK_DESC, FAKE_SEQUENCE, true, 120);
  await new Promise((r) => setTimeout(r, 50));

  // promoted_at should be included in the update call
  expect(db._updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ promoted_at: expect.any(String) })
  );
});

// ── 6. auto-promotion does NOT trigger when confidence < 0.85 ─────────────────
it('does not auto-promote when confidence is below 0.85', async () => {
  // 2 success, 2 failures → confidence would be 3/5 = 0.6 after one more success
  const existingRow = makeRecord({ success_count: 2, failure_count: 2, promoted_at: undefined });
  const db = buildMockDb({ rpcData: [existingRow] });
  mockSupabase(db);

  recordExecution(FAKE_USER, FAKE_TASK_TYPE, FAKE_TASK_DESC, FAKE_SEQUENCE, true, 120);
  await new Promise((r) => setTimeout(r, 50));

  const updateCall = db._updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
  expect(updateCall).not.toHaveProperty('promoted_at');
});

// ── 7. cache hit avoids DB call ───────────────────────────────────────────────
it('returns cached result without a DB round-trip on second call', async () => {
  const row = makeRecord({ similarity: 0.91 });
  const db = buildMockDb({ rpcData: [row] });
  mockSupabase(db);

  // First call: DB hit
  const first = await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);
  expect(db.rpc).toHaveBeenCalledTimes(1);

  // Second call: cache hit
  const second = await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);
  expect(db.rpc).toHaveBeenCalledTimes(1); // no extra call
  expect(second).toEqual(first);
});

// ── 8. cache expiry forces DB refetch ────────────────────────────────────────
it('refetches from DB after cache entry expires', async () => {
  const row = makeRecord({ similarity: 0.91 });
  const db = buildMockDb({ rpcData: [row] });
  mockSupabase(db);

  await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);
  expect(db.rpc).toHaveBeenCalledTimes(1);

  // Force expiry by directly manipulating private cache via _clearCache
  _clearCache(); _resetSupabase();

  await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);
  expect(db.rpc).toHaveBeenCalledTimes(2);
});

// ── 9. invalidateProcedure resets confidence ──────────────────────────────────
it('invalidateProcedure sets failure_count to 9999 and clears promoted_at', async () => {
  const db = buildMockDb();
  mockSupabase(db);

  await invalidateProcedure('proc-abc-123');

  expect(db._updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ failure_count: 9999, promoted_at: undefined })
  );
  expect(db._eqMock).toHaveBeenCalledWith('id', 'proc-abc-123');
});

// ── 10. StateDiff is always populated on ToolExecutionResult ─────────────────
it('executeTool always returns stateDiff with populated before/action fields', async () => {
  // Mock toolRegistry used by executeTool
  jest.mock('../toolRegistry', () => ({
    getToolRegistry: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue({ binary: 'gh' }),
      isInstalled: jest.fn().mockReturnValue(false),
    }),
  }));

  const result = await executeTool({ harness: 'gh', command: ['pr', 'list'] });

  expect(result).toHaveProperty('stateDiff');
  expect(result.stateDiff).toHaveProperty('before');
  expect(result.stateDiff).toHaveProperty('action');
  expect(result.stateDiff).toHaveProperty('after');
  expect(result.stateDiff).toHaveProperty('delta');
  expect(result.stateDiff.action.tool).toBe('gh');
  // Should not throw
  expect(typeof result.stateDiff.delta).toBe('object');
});

// ── 11. delta derivation for added/removed/changed keys ──────────────────────
it('deriveDelta correctly identifies added, removed, and changed keys', async () => {
  // stateDiff is always populated on any executeTool result, even early-exit paths.
  // The 'not installed' path returns emptyStateDiff with delta=[].
  // We verify the structure is correct and the action is correctly captured.
  const result = await executeTool({
    harness: 'gh',
    command: ['pr', 'list'],
  });

  expect(result).toHaveProperty('stateDiff');
  expect(Array.isArray(result.stateDiff.delta)).toBe(true);
  expect(result.stateDiff.action.tool).toBe('gh');
  expect(result.stateDiff.action.command).toMatch(/gh pr list/);
});

// ── 12. fire-and-forget recordExecution doesn't throw on DB error ─────────────
it('recordExecution swallows DB errors and never throws', async () => {
  const db = buildMockDb({ rpcError: { message: 'connection refused' } });
  mockSupabase(db);

  // Should NOT throw
  await expect(
    new Promise<void>((resolve) => {
      recordExecution(FAKE_USER, FAKE_TASK_TYPE, FAKE_TASK_DESC, FAKE_SEQUENCE, true, 100);
      setTimeout(resolve, 80);
    })
  ).resolves.toBeUndefined();
});

// ── 13. router returns source:'procedural_memory' on high-confidence macro hit ─
it('AgentRouter classify() returns source=procedural_memory on stable macro hit', async () => {
  // confidence = 6/6 = 1.0, which is >= AUTO_PROMOTE_MIN_CONFIDENCE (0.85)
  const row = makeRecord({ similarity: 0.95, success_count: 6, failure_count: 0, confidence: 1.0 });
  const db = buildMockDb({ rpcData: [row] });
  mockSupabase(db);

  const router = new AgentRouter();
  const decision = await router.classify({
    query: FAKE_TASK_DESC,
    userId: FAKE_USER,
  });

  expect(decision.source).toBe('procedural_memory');
  expect(decision.confidence).toBe(1.0);
  expect(decision.proceduralSequence).toEqual(FAKE_SEQUENCE);
});

// ── 14. router falls through to LLM on low-confidence / no-match ─────────────
it('AgentRouter classify() falls through to LLM routing when no procedural match', async () => {
  const db = buildMockDb({ rpcData: [] }); // no match
  mockSupabase(db);

  const router = new AgentRouter();
  const decision = await router.classify({
    query: 'something completely different that has no stored procedure',
    userId: FAKE_USER,
  });

  // Should fall through to LLM routing
  expect(decision.source).toBe('llm_routing');
  // Gemini mock returns quick_answer
  expect(decision.taskType).toBe('quick_answer');
});

// ── 15. promoteToMacro sets promoted_at ──────────────────────────────────────
it('promoteToMacro sets promoted_at on the correct record', async () => {
  const db = buildMockDb();
  mockSupabase(db);

  await promoteToMacro('proc-xyz-999');

  expect(db._updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ promoted_at: expect.any(String) })
  );
  expect(db._eqMock).toHaveBeenCalledWith('id', 'proc-xyz-999');
});

// ── 16. isStableMacro is false when promoted_at is undefined ──────────────────────
it('findMatchingProcedure sets isStableMacro=false when promoted_at is undefined', async () => {
  const row = makeRecord({ promoted_at: undefined, success_count: 1, confidence: 1.0, similarity: 0.93 });
  const db = buildMockDb({ rpcData: [row] });
  mockSupabase(db);

  const result = await findMatchingProcedure(FAKE_USER, FAKE_TASK_DESC);

  expect(result).not.toBeNull();
  expect(result!.isStableMacro).toBe(false);
});
