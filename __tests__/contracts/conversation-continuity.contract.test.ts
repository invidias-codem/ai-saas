import {
  transitionRun,
  validateDelegation,
  type RunCursor,
  type EngineDelegation,
} from '@/lib/ucol/continuity/contracts';

const initial: RunCursor = {
  runId: 'run-a', status: 'queued', phase: 'queued',
  generation: 2, sequence: 0, resultRef: null,
};
const running: RunCursor = {
  ...initial, status: 'running', phase: 'processing', sequence: 1,
};

describe('conversation continuity — fail-closed durable run contract', () => {
  it('progresses through sequenced, fenced state changes', () => {
    expect(transitionRun(initial, {
      expectedGeneration: 2, nextSequence: 1, status: 'running', phase: 'processing',
    })).toEqual(running);
    expect(transitionRun(running, {
      expectedGeneration: 2, nextSequence: 2,
      status: 'completed', phase: 'completed', resultRef: 'artifact-sha256:abc',
    })).toMatchObject({ status: 'completed', sequence: 2, resultRef: 'artifact-sha256:abc' });
  });
  it('rejects stale control generations', () => {
    expect(() => transitionRun(initial, {
      expectedGeneration: 1, nextSequence: 1, status: 'running', phase: 'processing',
    })).toThrow('stale_generation');
  });
  it('rejects replay of old or skipped events', () => {
    for (const nextSequence of [0, 2, 3]) {
      expect(() => transitionRun(initial, {
        expectedGeneration: 2, nextSequence,
        status: 'running', phase: 'processing',
      })).toThrow('event_sequence_conflict');
    }
  });
  it('does not mark a run completed without a stored result', () => {
    expect(() => transitionRun(running, {
      expectedGeneration: 2, nextSequence: 2, status: 'completed', phase: 'completed',
    })).toThrow('missing_durable_result');
  });
  it('never resurrects a completed or failed run', () => {
    for (const status of ['completed','failed','cancelled'] as const) {
      expect(() => transitionRun({ ...running, status }, {
        expectedGeneration: 2, nextSequence: 2, status: 'running', phase: 'processing',
      })).toThrow('terminal_run_immutable');
    }
  });
  it('requires explicit resumption after awaiting approval', () => {
    expect(() => transitionRun({ ...running, status: 'awaiting_approval' }, {
      expectedGeneration: 2, nextSequence: 2, status: 'completed',
      phase: 'completed', resultRef: 'artifact:abc',
    })).toThrow('invalid_run_transition');
  });
  it('rotates control generation both on approval pause and resumption', () => {
    expect(() => transitionRun(running, {
      expectedGeneration: 2, nextSequence: 2, status: 'awaiting_approval', phase: 'awaiting_approval',
    })).toThrow('handoff_requires_generation_rotation');
    const paused = transitionRun(running, {
      expectedGeneration: 2, nextSequence: 2, status: 'awaiting_approval',
      phase: 'awaiting_approval', nextGeneration: 3,
    });
    expect(paused.generation).toBe(3);
    expect(() => transitionRun(paused, {
      expectedGeneration: 3, nextSequence: 3, status: 'running', phase: 'resumed',
    })).toThrow('handoff_requires_generation_rotation');
    const resumed = transitionRun(paused, {
      expectedGeneration: 3, nextSequence: 3, status: 'running',
      phase: 'resumed', nextGeneration: 4,
    });
    expect(resumed.generation).toBe(4);
    expect(resumed.sequence).toBe(3);
  });
});

const delegation: EngineDelegation = {
  parentRunId: 'run-a', userId: 'clerk-a', workspaceId: 'ws-a', conversationId: 'conv-a',
  engine: 'code', capabilities: ['read_workspace', 'draft_code'],
  maximumCostCents: 200, contextPacketRef: 'packet:sha256',
};
const gate = {
  parentRunId: 'run-a', userId: 'clerk-a', workspaceId: 'ws-a',
  conversationId: 'conv-a',
  allowedEngines: ['code', 'research'] as const,
  allowedCapabilities: ['read_workspace', 'draft_code'],
  remainingBudgetCents: 250,
};

describe('workspace engine collaboration — delegation scope and budget', () => {
  it('allows an explicitly permitted specialist', () => {
    expect(() => validateDelegation({ ...gate, delegation })).not.toThrow();
  });
  it('never delegates to another workspace or identity', () => {
    for (const mutation of [
      { workspaceId: 'ws-b' }, { userId: 'clerk-b' },
      { conversationId: 'conv-b' }, { parentRunId: 'another-run' },
    ]) {
      expect(() => validateDelegation({ ...gate, delegation: { ...delegation, ...mutation } }))
        .toThrow('delegation_scope_mismatch');
    }
  });
  it('rejects unauthorized engines and actions', () => {
    expect(() => validateDelegation({ ...gate, delegation: { ...delegation, engine: 'image' } }))
      .toThrow('engine_not_authorized');
    expect(() => validateDelegation({
      ...gate, delegation: { ...delegation, capabilities: ['deploy_to_production'] },
    })).toThrow('delegation_capability_denied');
  });
  it('bounds engine spend before dispatch', () => {
    expect(() => validateDelegation({
      ...gate, delegation: { ...delegation, maximumCostCents: 251 },
    })).toThrow('delegation_budget_exceeded');
  });
  it('requires a scoped context packet reference', () => {
    expect(() => validateDelegation({
      ...gate, delegation: { ...delegation, contextPacketRef: '' },
    })).toThrow('missing_context_packet');
  });
});
