// ─── Mocks ─────────────────────────────────────────────────────────────────

// Module-level mock query builder, initialized before jest.mock factory runs.
const mockQB = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
  single: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
};

jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnValue(mockQB),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────
import { unifiedSessionStore } from '@/lib/code-builder/unifiedSession/store';
import { supabaseAdmin } from '@/lib/supabaseClient';

const mockFrom = (supabaseAdmin as any).from as jest.Mock;

// Capture the mock QB from the first from() call.
(mockFrom as jest.Mock)();

// ─── Test data ────────────────────────────────────────────────────────────

const workspaceId = 'workspace_456';
const artifactRevision = 'sha256:abc123def456';
const sessionId = 'session_1';
const agentId = 'agent_1';
const humanUserId = 'user_123';

const mockSession = {
  id: sessionId,
  workspace_id: workspaceId,
  build_id: 'build_1',
  preview_id: 'preview_1',
  desktop_id: 'desktop_1',
  artifact_revision: artifactRevision,
  control_mode: 'agent',
  control_generation: 1,
  input_control_holder: 'agent:agent_1',
  input_control_granted_at: new Date().toISOString(),
  input_control_expires_at: new Date(Date.now() + 86400000).toISOString(),
  session_lease_user: 'user_123',
  session_lease_granted_at: new Date().toISOString(),
  session_lease_expires_at: new Date(Date.now() + 86400000).toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
};

function configureGetSession(session: typeof mockSession | null) {
  mockQB.maybeSingle.mockResolvedValueOnce({ data: session, error: null });
}

function configureInsert(data: unknown) {
  mockQB.single.mockResolvedValueOnce({ data, error: null });
}

function configureUpdate(data: unknown) {
  // A scoped update ends in .select('id').maybeSingle() and must return a row.
  mockQB.maybeSingle.mockResolvedValueOnce({
    data: data ? { id: (data as { id?: string }).id ?? sessionId } : null,
    error: null,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('unified session store (Phase 8F.0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQB.select.mockReturnThis();
    mockQB.eq.mockReturnThis();
    mockQB.insert.mockReturnThis();
    mockQB.update.mockReturnThis();
    mockQB.single.mockReturnThis();
    mockQB.maybeSingle.mockReset();
  });

  it('creates a unified session in observer mode', async () => {
    configureInsert({ ...mockSession, id: sessionId, control_mode: 'observer', control_generation: 0, input_control_holder: null, session_lease_user: null });

    const session = await unifiedSessionStore.createSession({
      workspace_id: workspaceId,
      artifact_revision: artifactRevision,
    });

    expect(session.id).toBe(sessionId);
    expect(session.workspace_id).toBe(workspaceId);
    expect(session.artifact_revision).toBe(artifactRevision);
    expect(session.control_mode).toBe('observer');
    expect(session.control_generation).toBe(0);
    expect(session.input_control).toBeNull();
    expect(session.session_lease_user).toBeNull();
  });

  it('gets a session by ID', async () => {
    configureGetSession(mockSession);

    const session = await unifiedSessionStore.getSession(sessionId);

    expect(session).not.toBeNull();
    expect(session!.id).toBe(sessionId);
    expect(session!.control_mode).toBe('agent');
    expect(session!.control_generation).toBe(1);
  });

  it('returns null for a missing session', async () => {
    configureGetSession(null);

    const session = await unifiedSessionStore.getSession('missing');
    expect(session).toBeNull();
  });

  it('getSessionState returns full control state', async () => {
    configureGetSession(mockSession);

    const state = await unifiedSessionStore.getSessionState(sessionId);

    expect(state).not.toBeNull();
    expect(state!.session.id).toBe(sessionId);
    expect(state!.control.mode).toBe('agent');
    expect(state!.control.generation).toBe(1);
    expect(state!.control.input_holder).toEqual({ type: 'agent', id: 'agent_1' });
    expect(state!.control.observer_user).toBe('user_123');
    expect(state!.canAct.agent).toBe(true);
    expect(state!.canAct.human).toBe(false);
    expect(state!.canAct.observer).toBe(true);
  });

  it('associateResource links a preview sandbox', async () => {
    configureUpdate(mockSession);

    await unifiedSessionStore.associateResource({
      session_id: sessionId,
      resource_type: 'preview',
      resource_id: 'preview_1',
    });

    // Verify the update call included preview_id
    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].preview_id).toBe('preview_1');
  });

  it('grantObserver gives view-only access without input authority', async () => {
    configureUpdate(mockSession);

    await unifiedSessionStore.grantObserver({
      session_id: sessionId,
      user_id: humanUserId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].session_lease_user).toBe(humanUserId);
    // Observer does NOT set input_control_holder
    expect(updateCall[0].input_control_holder).toBeUndefined();
  });

  it('grantInputControl for agent sets input authority', async () => {
    configureGetSession(mockSession);
    configureUpdate(mockSession);

    await unifiedSessionStore.grantInputControl({
      session_id: sessionId,
      holder_type: 'agent',
      holder_id: agentId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].input_control_holder).toBe(`agent:${agentId}`);
    expect(updateCall[0].control_mode).toBe('agent');
  });

  it('grantInputControl for human sets input authority', async () => {
    configureGetSession(mockSession);
    configureUpdate(mockSession);

    await unifiedSessionStore.grantInputControl({
      session_id: sessionId,
      holder_type: 'human',
      holder_id: humanUserId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].input_control_holder).toBe(`human:${humanUserId}`);
    expect(updateCall[0].control_mode).toBe('human');
  });

  it('takeControl advances generation and revokes agent input', async () => {
    configureGetSession({
      ...mockSession,
      control_generation: 1,
      input_control_holder: 'agent:agent_1',
      control_mode: 'agent',
    });
    configureUpdate({
      ...mockSession,
      control_generation: 2,
      input_control_holder: `human:${humanUserId}`,
      control_mode: 'human',
    });

    await unifiedSessionStore.takeControl({
      session_id: sessionId,
      human_user_id: humanUserId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].control_generation).toBe(2);
    expect(updateCall[0].input_control_holder).toBe(`human:${humanUserId}`);
    expect(updateCall[0].control_mode).toBe('human');
    // Generation fencing: .eq('control_generation', 1) was chained
    const eqCalls = mockQB.eq.mock.calls;
    const genEq = eqCalls.find((c) => c[0] === 'control_generation');
    expect(genEq).toBeDefined();
    expect(genEq![1]).toBe(1);
  });

  it('handBackToAI advances generation and revokes human input', async () => {
    configureGetSession({
      ...mockSession,
      control_generation: 2,
      input_control_holder: `human:${humanUserId}`,
      control_mode: 'human',
    });
    configureUpdate({
      ...mockSession,
      control_generation: 3,
      input_control_holder: `agent:${agentId}`,
      control_mode: 'agent',
    });

    await unifiedSessionStore.handBackToAI({
      session_id: sessionId,
      agent_id: agentId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].control_generation).toBe(3);
    expect(updateCall[0].input_control_holder).toBe(`agent:${agentId}`);
    expect(updateCall[0].control_mode).toBe('agent');
    const eqCalls = mockQB.eq.mock.calls;
    const genEq = eqCalls.find((c) => c[0] === 'control_generation');
    expect(genEq).toBeDefined();
    expect(genEq![1]).toBe(2);
  });

  it('takeControl includes generation fencing clause', async () => {
    configureGetSession({
      ...mockSession,
      control_generation: 5,
      input_control_holder: 'agent:agent_1',
      control_mode: 'agent',
    });
    configureUpdate(mockSession);

    await unifiedSessionStore.takeControl({
      session_id: sessionId,
      human_user_id: humanUserId,
    });

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].control_generation).toBe(6);
    // Verify generation fencing: .eq('control_generation', 5) was chained
    const eqCalls = mockQB.eq.mock.calls;
    const genEq = eqCalls.find((c) => c[0] === 'control_generation');
    expect(genEq).toBeDefined();
    expect(genEq![1]).toBe(5);
  });

  it('never revokes control on other sessions when granting a lease', async () => {
    configureGetSession(mockSession);
    configureUpdate(mockSession);

    await unifiedSessionStore.grantInputControl({
      session_id: sessionId,
      holder_type: 'human',
      holder_id: humanUserId,
    });

    expect(mockQB.update).toHaveBeenCalledTimes(1);
    expect(mockQB.eq).toHaveBeenCalledWith('id', sessionId);
    expect(mockQB.eq).toHaveBeenCalledWith('control_generation', 1);
    const patch = mockQB.update.mock.calls[0][0];
    expect(patch.control_generation).toBe(2);
  });

  it('reports a losing handoff CAS as a conflict instead of success', async () => {
    configureGetSession(mockSession);
    configureUpdate(null);
    await expect(
      unifiedSessionStore.takeControl({ session_id: sessionId, human_user_id: humanUserId })
    ).rejects.toThrow('stale generation');
  });

  it('does not issue input control for an expired session', async () => {
    configureGetSession({ ...mockSession, expires_at: new Date(0).toISOString() });
    await expect(
      unifiedSessionStore.grantInputControl({
        session_id: sessionId, holder_type: 'agent', holder_id: agentId,
      })
    ).rejects.toThrow('session expired');
    expect(mockQB.update).not.toHaveBeenCalled();
  });

  it('returns non-actionable state for expired session and control leases', async () => {
    configureGetSession({
      ...mockSession,
      input_control_expires_at: new Date(0).toISOString(),
      session_lease_expires_at: new Date(0).toISOString(),
    });
    const state = await unifiedSessionStore.getSessionState(sessionId);
    expect(state?.canAct.agent).toBe(false);
    expect(state?.canAct.observer).toBe(false);
  });

  it('revokeInputControl clears input authority and resets to observer', async () => {
    configureGetSession(mockSession);
    configureUpdate(mockSession);

    await unifiedSessionStore.revokeInputControl(sessionId);

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].input_control_holder).toBeNull();
    expect(updateCall[0].control_mode).toBe('observer');
  });

  it('revokeObserver clears view access', async () => {
    configureUpdate(mockSession);

    await unifiedSessionStore.revokeObserver(sessionId);

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].session_lease_user).toBeNull();
  });

  it('expireSession sets expires_at to now', async () => {
    configureGetSession(mockSession);
    configureUpdate(mockSession);

    await unifiedSessionStore.expireSession(sessionId);

    const updateCall = mockQB.update.mock.calls[mockQB.update.mock.calls.length - 1];
    expect(updateCall[0].expires_at).toBeDefined();
  });
});
