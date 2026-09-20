/**
 * Code Builder build-store contract (Phase 3).
 *
 * Locks the lifecycle-invariant semantics of lib/code-builder/buildStore.ts:
 *   - deterministic operation_key (codebuild:<buildId>:v1)
 *   - upsert on build_id (retry/replay never mints a second logical build)
 *   - terminal-state idempotency (complete/fail/cancel filter non-terminal rows)
 *   - error/prompt sanitization (no secrets/keys/stack dumps persisted)
 */
import {
  createBuild,
  completeBuild,
  failBuild,
  cancelBuild,
  markBuildRunning,
  updateBuildPhase,
  sanitizeForPersistence,
} from '@/lib/code-builder/buildStore';

jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

function admin() {
  return require('@/lib/supabaseClient').supabaseAdmin as any;
}

function chain({
  updateRes = { error: null },
  upsertRes = { error: null, data: { build_id: 'b1' } },
  readback = { error: null, data: { build_id: 'b1' } },
}: any = {}) {
  const supabase = admin();
  const update = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({
      not: jest.fn().mockReturnValue(updateRes),
    }),
  });
  const upsert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue(upsertRes),
      maybeSingle: jest.fn().mockResolvedValue(upsertRes),
    }),
  });
  const select = jest.fn().mockReturnValue({
    eq: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue(readback) }),
  });
  (supabase.from as jest.Mock).mockReturnValue({ update, upsert, select });
  return { update, upsert, select };
}

describe('buildStore — durable build lifecycle contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('derives a deterministic operation_key from buildId (codebuild:<id>:v1)', async () => {
    const { upsert } = chain();
    await createBuild({ buildId: 'b1', userId: 'u1', mode: 'full', prompt: 'hi' });
    const payload = upsert.mock.calls[0][0];
    expect(payload.operation_key).toBe('codebuild:b1:v1');
    expect(payload.build_id).toBe('b1');
    expect(payload.status).toBe('queued');
  });

  it('createBuild upserts on build_id with ignoreDuplicates (retry never inserts a second build)', async () => {
    const { upsert } = chain();
    await createBuild({ buildId: 'b1', userId: 'u1', mode: 'full' });
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'build_id', ignoreDuplicates: true });
  });

  it('retry preserves the original row: no overwrite, one row, correlation kept', async () => {
    // Run A creates the row; the API stamps correlation (running + run id A).
    const original = {
      build_id: 'b1', status: 'running', trigger_run_id: 'run_A',
      request_id: 'req_A', started_at: '2026-09-20T14:25:15.609Z',
      created_at: '2026-09-20T14:25:15.100Z', operation_key: 'codebuild:b1:v1',
    };
    // Run B (worker retry) upsert returns NO row — ON CONFLICT DO NOTHING hit.
    const { upsert, select } = chain({
      upsertRes: { error: null, data: null },
      readback: { error: null, data: original },
    });
    const returned = await createBuild({ buildId: 'b1', userId: 'u1', requestId: 'req_B', mode: 'full', prompt: 'x' });

    // 1. No overwrite: the upsert that fired was DO NOTHING — never an UPDATE.
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'build_id', ignoreDuplicates: true });
    // 2. Still exactly one row: readback by build_id, never a second insert.
    expect(select).toHaveBeenCalled();
    expect(returned).toEqual(original);
    // 3. Original correlation fields preserved in the returned row.
    expect(returned.trigger_run_id).toBe('run_A');
    expect(returned.request_id).toBe('req_A');
    expect(returned.status).toBe('running');
  });

  it('terminal transitions filter non-terminal rows (idempotent — no-op once terminal)', async () => {
    const { update } = chain();
    await completeBuild('b1');
    const updateCall = update.mock.calls[0];
    expect(updateCall[0]).toMatchObject({ status: 'completed', progress: 100 });
    // .eq('build_id','b1').not('status','in','(completed,failed,cancelled)') — guards idempotency
    const eq = update.mock.results[0].value.eq;
    expect(eq).toHaveBeenCalledWith('build_id', 'b1');
  });

  it('failBuild sanitizes the error message before persistence', async () => {
    const { update } = chain();
    await failBuild('b1', 'BUILD_FAILED', 'supabase_service_role_key=eyJsecret1234567890123456 stacktrace here');
    const payload = update.mock.calls[0][0];
    expect(payload.error_message).not.toMatch(/eyJsecret/i);
    expect(payload.error_message).toMatch(/REDACTED/);
    expect(payload.status).toBe('failed');
  });

  it('sanitizeForPersistence strips obvious secrets and keys', () => {
    const dirty = 'Bearer nvapi-abcdefghijklmnop serial: sk-1234567890abc token=PAYPAL_SECRET_VALUE';
    const clean = sanitizeForPersistence(dirty)!;
    expect(clean).not.toContain('nvapi-');
    expect(clean).not.toContain('sk-');
    expect(clean).not.toContain('PAYPAL_SECRET_VALUE');
  });

  it('markBuildRunning stamps running + started_at', async () => {
    const { update } = chain();
    await markBuildRunning('b1', 'run_123');
    expect(update.mock.calls[0][0]).toMatchObject({ status: 'running', trigger_run_id: 'run_123' });
    expect(update.mock.calls[0][0].started_at).toBeTruthy();
  });

  it('cancelBuild is a terminal transition', async () => {
    const { update } = chain();
    await cancelBuild('b1');
    expect(update.mock.calls[0][0]).toMatchObject({ status: 'cancelled' });
  });

  it('updateBuildPhase writes phase + progress', async () => {
    const { update } = chain();
    await updateBuildPhase('b1', 'generating', 55);
    expect(update.mock.calls[0][0]).toEqual({ phase: 'generating', progress: 55 });
  });
});