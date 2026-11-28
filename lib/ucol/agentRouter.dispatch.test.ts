jest.mock('@/lib/llm/providers/gemini', () => ({ GeminiProvider: jest.fn() }));
jest.mock('./proceduralMemory', () => ({ findMatchingProcedure: jest.fn() }));
import { AgentRouter, type RoutingDecision } from './agentRouter';

describe('JKlaw dispatch acknowledgement', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.JKLAW_API_KEY;
  const originalTwin = process.env.JKLAW_TWIN_URL;
  const task = { query: 'test question', userId: 'user_test' };
  const decision: RoutingDecision = { taskType: 'research', targetNode: 'jklaw', confidence: 0.9, reasoning: 'test' };
  beforeEach(() => { process.env.JKLAW_API_KEY = 'test-key'; delete process.env.JKLAW_TWIN_URL; });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.JKLAW_API_KEY; else process.env.JKLAW_API_KEY = originalKey;
    if (originalTwin === undefined) delete process.env.JKLAW_TWIN_URL; else process.env.JKLAW_TWIN_URL = originalTwin;
  });
  test('internal endpoint timeout never claims a successful dispatch', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('deadline', 'TimeoutError'));
    expect(await new AgentRouter().dispatchToJKlaw(task, decision, false))
      .toEqual({ dispatched: false, error: 'JKlaw dispatch timed out; outcome unknown' });
  });
  test('ambiguous twin timeout does not duplicate the request through the internal endpoint', async () => {
    process.env.JKLAW_TWIN_URL = 'https://twin.example.test';
    global.fetch = jest.fn().mockRejectedValue(new DOMException('deadline', 'AbortError'));
    expect((await new AgentRouter().dispatchToJKlaw(task, decision, true)).dispatched).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
