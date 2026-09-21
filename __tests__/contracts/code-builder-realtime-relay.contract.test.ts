/**
 * Realtime relay route contract (Phase 4B).
 *
 * Locks the product-boundary semantics of the SSE relay:
 *   - 503 when Trigger is not configured (relay is an enhancement, not a dep)
 *   - ownership: same 404 for not-found and not-owned (no existence disclosure)
 *   - 409 when the build row has no run correlation
 *   - streams ONLY the product status shape (`run-status` events carry
 *     { status, updatedAt } — never payload/output/metadata)
 *   - unsubscribes upstream on client disconnect
 */
import { GET } from '@/app/api/code-builder/build/[buildId]/events/route';

jest.mock('@/lib/security/apiAuth', () => ({
  requireAuth: jest.fn().mockResolvedValue({ userId: 'u1' }),
  handleAuthError: () => null,
}));

const getBuild = jest.fn();
const failBuild = jest.fn().mockResolvedValue(undefined);
const cancelBuild = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/code-builder/buildStore', () => ({
  getBuild: (...args: unknown[]) => getBuild(...args),
  failBuild: (...args: unknown[]) => failBuild(...args),
  cancelBuild: (...args: unknown[]) => cancelBuild(...args),
}));

jest.mock('@/lib/env', () => ({
  env: { TRIGGER_SECRET_KEY: 'tr_test_key' },
}));

const unsubscribe = jest.fn();
const subscribeToRun = jest.fn();
jest.mock('@trigger.dev/sdk', () => ({
  runs: { subscribeToRun: (...args: unknown[]) => subscribeToRun(...args) },
}));

function req(buildId = 'b1') {
  return new Request(`http://localhost/api/code-builder/build/${buildId}/events`, {
    signal: new AbortController().signal,
  });
}

/** Run-subscription mock: yields snapshots then ends (terminal close). */
function terminalRunStream(status = 'COMPLETED_SUCCESSFULLY') {
  const snapshots = [{ status, updatedAt: '2026-09-20T14:52:34Z' } as any];
  const stream = new ReadableStream({
    start(c) {
      snapshots.forEach((s) => c.enqueue(s));
      c.close();
    },
  });
  return { unsubscribe, getReader: () => stream.getReader() };
}

describe('realtime relay route — product-boundary contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 503 when Trigger is not configured (polling remains the backbone)', async () => {
    const { env } = require('@/lib/env');
    (env as any).TRIGGER_SECRET_KEY = undefined;
    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    expect(res.status).toBe(503);
    (env as any).TRIGGER_SECRET_KEY = 'tr_test_key';
  });

  it('returns 404 for another user\'s build (no existence disclosure)', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'someone-else', trigger_run_id: 'run_1' });
    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    expect(res.status).toBe(404);
    expect(subscribeToRun).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent build', async () => {
    getBuild.mockResolvedValue(null);
    const res = await GET(req('nope') as any, { params: Promise.resolve({ buildId: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when the row has no trigger_run_id', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'u1', trigger_run_id: null });
    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    expect(res.status).toBe(409);
    expect(subscribeToRun).not.toHaveBeenCalled();
  });

  it('streams product-shaped run-status events and closes on terminal', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'u1', trigger_run_id: 'run_xyz' });
    subscribeToRun.mockReturnValue(terminalRunStream());

    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const body = await res.text(); // ReadableStream drains
    expect(subscribeToRun).toHaveBeenCalledWith('run_xyz');
    expect(body).toContain('event: open');
    expect(body).toContain('event: run-status');
    expect(body).toContain('"status":"COMPLETED_SUCCESSFULLY"');
    // Success is the worker's to own — relay must NOT reconcile it.
    expect(failBuild).not.toHaveBeenCalled();
    expect(cancelBuild).not.toHaveBeenCalled();
    // Product boundary: no payload/output/metadata keys ever emitted.
    expect(body).not.toMatch(/"payload"|"output"|"metadata"/);
  });

  it('reconciles platform failures into the durable row BEFORE emitting (qodo #1)', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'u1', trigger_run_id: 'run_xyz' });
    subscribeToRun.mockReturnValue(terminalRunStream('CRASHED'));

    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    const body = await res.text();

    // Reconcile-then-emit: the CRASHED status IS in the body, and failBuild
    // ran during the same stream (route awaits it before sending).
    expect(failBuild).toHaveBeenCalledWith('b1', 'TRIGGER_CRASHED', expect.any(String));
    expect(body).toContain('"status":"CRASHED"');
    expect(body).not.toMatch(/"payload"|"output"|"metadata"/);
  });

  it('maps CANCELED to cancelBuild, not failBuild', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'u1', trigger_run_id: 'run_xyz' });
    subscribeToRun.mockReturnValue(terminalRunStream('CANCELED'));

    const res = await GET(req() as any, { params: Promise.resolve({ buildId: 'b1' }) });
    await res.text();
    expect(cancelBuild).toHaveBeenCalledWith('b1');
    expect(failBuild).not.toHaveBeenCalled();
  });

  it('unsubscribes upstream when the client disconnects', async () => {
    getBuild.mockResolvedValue({ build_id: 'b1', user_id: 'u1', trigger_run_id: 'run_xyz' });
    // Never-ending stream — only the abort path can end it.
    const stream = new ReadableStream({ start() { /* no items, never closes */ } });
    subscribeToRun.mockReturnValue({
      unsubscribe,
      getReader: () => stream.getReader(),
    });

    const controller = new AbortController();
    const r = new Request('http://localhost/api/code-builder/build/b1/events', {
      signal: controller.signal,
    });
    const res = await GET(r as any, { params: Promise.resolve({ buildId: 'b1' }) });
    expect(res.status).toBe(200);

    controller.abort();
    // unsubscribe is called synchronously in the abort listener.
    expect(unsubscribe).toHaveBeenCalled();
  });
});
