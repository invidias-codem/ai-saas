/**
 * Shadow decision plane contract (slice 1).
 *
 * Locks the sovereign-seam invariants:
 *   1. No TYPESAFE_API_KEY → zero outbound calls (the plane is inert).
 *   2. With a key: exactly ONE batched Jev request per routing decision —
 *      one state, five questions, never per-question round trips.
 *   3. The request never mentions providers/models — semantics only
 *      (indirection is a documented Jev 1.13 weakness).
 *   4. Telemetry carries agreement + tier comparison + cost/latency.
 *   5. The production decision object is never mutated — routing untouched.
 *   6. Model is pinned to a version, never the `jev-latest` alias.
 */
import { shadowEvaluateRouting } from '@/lib/intelligence/decision/shadowRouter';

const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

// logEvent goes to Supabase — stub it to a sink we can inspect.
const logEventMock = jest.fn();
jest.mock('@/lib/telemetry', () => ({
  logEvent: (...a: any[]) => logEventMock(...a),
}));

// No env schema import at module scope — provider reads process.env lazily
// through the shared `env` object; patch it per-test.
jest.mock('@/lib/env', () => ({
  env: {},
}));

function decision(category = 'coding_task') {
  return {
    requestId: 'r1',
    resolvedWorkspaceId: 'ws1',
    intent: { category, confidence: 0.8, subtypes: [], urgency: 'normal' },
    providerPlan: { preferredModelRefs: ['nvidia/nemotron-3-ultra-550b-a55b'] },
  } as any;
}

function jevResponse(answers: Record<string, any>) {
  return {
    model: 'jev-1.13.0',
    answers,
    usage: { input_tokens: 512, output_tokens: 0 },
  };
}

const CHOICE_ANSWER = {
  type: 'choice',
  choice: 'coding_task',
  probabilities: { coding_task: 0.9, general_chat: 0.1 },
  confidence: 0.9,
};

describe('shadow decision plane — sovereign seam contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is INERT without a key: no fetch, no telemetry', async () => {
    (require('@/lib/env').env as any).TYPESAFE_API_KEY = undefined;
    shadowEvaluateRouting({
      request: { requestId: 'r1', rawInput: 'build an app' },
      productionDecision: decision(),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('makes exactly ONE batched request with all five questions, semantics only', async () => {
    (require('@/lib/env').env as any).TYPESAFE_API_KEY = 'ts_test';
    (require('@/lib/env').env as any).JEV_MODEL = 'jev-1.13.0';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse({
        task_class: CHOICE_ANSWER,
        task_complexity: { type: 'score', score: 2.1, legend: {}, probabilities: {}, confidence: 0.7 },
        requires_tools: { type: 'noul', noul: 0.8 },
        requires_long_context: { type: 'noul', noul: 0.1 },
        requires_strong_reasoning: { type: 'noul', noul: 0.6 },
      })), { status: 200 })
    );

    shadowEvaluateRouting({
      request: { requestId: 'r2', rawInput: 'fix the login bug in auth.ts', userId: 'u1', workspaceId: 'ws1' },
      productionDecision: decision('coding_task'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 3,
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init.body);
    // One batched request, five questions.
    expect(Object.keys(body.questions)).toEqual([
      'task_class', 'task_complexity', 'requires_tools', 'requires_long_context', 'requires_strong_reasoning',
    ]);
    // Pinned model, never the alias.
    expect(body.model).toBe('jev-1.13.0');
    expect(body.model).not.toContain('latest');
    // State carries NO provider names, NO model catalog — semantics only.
    const stateJson = JSON.stringify(body.state);
    expect(stateJson).not.toMatch(/kimi|gemini|nemotron|nvidia|catalog/i);
    // Instructions never mention providers either.
    expect(JSON.stringify(body.questions)).not.toMatch(/kimi|gemini|nemotron|nvidia/i);

    // Comparison telemetry: agreement + tiers + cost.
    // complexity 2.1 + reasoning 0.6 → tier 'standard' per tierFromSemantics.
    expect(logEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'jev_shadow_decision',
      metadata: expect.objectContaining({
        requestId: 'r2',
        status: 'ok',
        productionIntent: 'coding_task',
        jevIntent: 'coding_task',
        agreement: true,
        jevTier: 'standard',
        jevLatencyMs: expect.any(Number),
      }),
    }));
  });

  it('Jev failure → unavailable telemetry, never an exception', async () => {
    (require('@/lib/env').env as any).TYPESAFE_API_KEY = 'ts_test';
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(() =>
      shadowEvaluateRouting({
        request: { requestId: 'r3', rawInput: 'hello' },
        productionDecision: decision('general_chat'),
        agentMode: 'fast',
        hasAttachments: false,
        messageHistoryCount: 0,
      })
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 40));
    expect(logEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'jev_shadow_decision',
      metadata: expect.objectContaining({ status: 'unavailable', requestId: 'r3' }),
    }));
  });
});
