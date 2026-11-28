/**
 * Phase 0 (#440 review finding 1) — worker wiring contract.
 *
 * The Trigger.dev agent-loop task must derive its tool registry AND its
 * system instruction from the same manifest runtime, pass the instruction
 * into runReActLoop, and thread requestId/conversationId through for
 * attribution. The @trigger.dev task wrapper is mocked as an identity so the
 * task body runs directly.
 */
jest.mock('@trigger.dev/sdk', () => ({ task: (cfg: unknown) => cfg }));
jest.mock('@/lib/agents/core/reactLoop', () => ({
  runReActLoop: jest.fn().mockResolvedValue({ status: 'success', answer: 'ok', trajectory: [] }),
}));
jest.mock('@/src/trigger/_registry', () => ({
  buildAgenticRuntime: jest
    .fn()
    .mockResolvedValue({ registry: 'FAKE-REGISTRY', manifest: { identity: 'weaver' }, systemInstruction: 'WORKER-SYSTEM-INSTRUCTION' }),
}));
jest.mock('@/src/trigger/_context', () => ({
  getAgenticContext: jest.fn().mockResolvedValue({ sessionId: 'ctx' }),
}));

import { agentLoopTask } from '@/src/trigger/agentLoopTask';
import { runReActLoop } from '@/lib/agents/core/reactLoop';
import { buildAgenticRuntime } from '@/src/trigger/_registry';

describe('worker agent-loop wiring (#440)', () => {
  it('builds the authorized runtime with correlation ids and passes its instruction to the loop', async () => {
    await (agentLoopTask as any).run({
      userId: 'u1',
      workspaceId: 'ws1',
      conversationId: 'conv-9',
      requestId: 'req-9',
      userQuery: 'do it',
      modelName: 'gemini-2.5-flash',
      mode: 'agentic',
    });

    expect(buildAgenticRuntime).toHaveBeenCalledWith({
      userId: 'u1',
      workspaceId: 'ws1',
      requestId: 'req-9',
      conversationId: 'conv-9',
    });
    expect(runReActLoop).toHaveBeenCalledWith(
      'do it',
      expect.anything(),
      'FAKE-REGISTRY',
      'gemini-2.5-flash',
      'WORKER-SYSTEM-INSTRUCTION',
    );
  });

  it('returns the loop result status to the caller', async () => {
    const result = await (agentLoopTask as any).run({
      userId: 'u1',
      workspaceId: 'ws1',
      userQuery: 'q',
      modelName: 'm',
      mode: 'agentic',
    });
    expect(result.status).toBe('success');
    expect(result.answer).toBe('ok');
  });
});
