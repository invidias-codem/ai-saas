/**
 * Shadow decision plane contract (slice 1 + 1A hardening).
 *
 * Locks the sovereign-seam invariants:
 *   1. No TYPESAFE_API_KEY → zero outbound calls (the plane is inert).
 *   2. With a key: exactly ONE batched Jev request per routing decision —
 *      one state, five questions, never per-question round trips.
 *   3. The request never mentions providers/models — semantics only
 *      (indirection is a documented Jev 1.13 weakness).
 *   4. Telemetry carries agreement + COMPARABLE tier comparison + cost/latency.
 *   5. The production decision object is never mutated — routing untouched.
 *   6. Model is pinned to a version, never an alias (env-schema-enforced).
 *   7. slice 1A: a response missing any question ID is NOT evidence →
 *      status:unavailable, never status:ok with fabricated fields.
 *   8. slice 1A: state egress is scrubbed (no raw emails/secrets reach Jev).
 *   9. slice 1A: events carry experiment stamps (schema/provider/model/
 *      questionSet/tierPolicy versions) and whole-operation latency.
 */
import { shadowEvaluateRouting } from '@/lib/intelligence/decision/shadowRouter';

const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

// logEvent goes to Supabase — stub it to a sink we can inspect.
const logEventMock = jest.fn();
jest.mock('@/lib/telemetry', () => ({
  logEvent: (...a: any[]) => logEventMock(...a),
}));

// env: mutable holder patched per-test (provider reads it lazily).
jest.mock('@/lib/env', () => ({ env: {} }));

// scrubText is real (security-critical) — import the REAL module, no mock.

function decision(category = 'coding_task', preferredModelRef = 'nvidia/nemotron-3-ultra-550b-a55b') {
  return {
    requestId: 'r1',
    resolvedWorkspaceId: 'ws1',
    intent: { category, confidence: 0.8, subtypes: [], urgency: 'normal' },
    providerPlan: { preferredModelRefs: [preferredModelRef] },
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
const FULL_ANSWERS = {
  task_class: CHOICE_ANSWER,
  capability_requirement: {
    type: 'choice',
    choice: 'quality',
    probabilities: { fast: 0.1, quality: 0.7, reasoning: 0.2 },
    confidence: 0.75,
  },
  reasoning_effort: {
    type: 'choice',
    choice: 'medium',
    probabilities: { low: 0.2, medium: 0.6, high: 0.15, max: 0.05 },
    confidence: 0.8,
  },
  risk_signal: { type: 'noul', noul: 0.2 },
  route_lease: {
    type: 'choice',
    choice: 'one_call',
    probabilities: { one_call: 0.7, tool_chain: 0.2, user_turn: 0.1 },
    confidence: 0.85,
  },
};

function setEnv(key: string, value: any) {
  (require('@/lib/env').env as any)[key] = value;
}

describe('shadow decision plane — sovereign seam contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEnv('JEV_MODEL', 'jev-1.13.0');
  });

  it('is INERT without a key: no fetch, no telemetry', async () => {
    setEnv('TYPESAFE_API_KEY', undefined);
    await shadowEvaluateRouting({
      request: { requestId: 'r1', rawInput: 'build an app' },
      productionDecision: decision(),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logEventMock).not.toHaveBeenCalled();
  });

  it('makes exactly ONE batched request; scrubbed state; comparable tiers; version stamps', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse(FULL_ANSWERS)), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: {
        requestId: 'r2',
        rawInput: 'fix the login bug in auth.ts — email me at jj@example.com with sk-abcdefghijklmnopqrst, api_key=supersecretvalue123',
        userId: 'u1',
        workspaceId: 'ws1',
      },
      productionDecision: decision('coding_task'),
      agentMode: 'quality',
      hasAttachments: false,
      messageHistoryCount: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(init.body);
    expect(Object.keys(body.questions)).toHaveLength(5);
    expect(Object.keys(body.questions).sort()).toEqual([
      'capability_requirement', 'reasoning_effort', 'risk_signal', 'route_lease', 'task_class',
    ]);
    expect(body.model).toBe('jev-1.13.0');

    // Egress hygiene: emails + labeled secrets scrubbed BEFORE leaving Lattice.
    const stateJson = JSON.stringify(body.state);
    expect(stateJson).not.toContain('jj@example.com');
    expect(stateJson).not.toContain('sk-abcdefghijklmnopqrst');
    expect(stateJson).not.toContain('supersecretvalue123');
    expect(stateJson).toContain('[REDACTED_EMAIL]');
    expect(stateJson).toContain('[REDACTED_SECRET]');

    // Semantics only — no provider/model names.
    expect(stateJson).not.toMatch(/kimi|gemini|nemotron|nvidia/i);
    expect(JSON.stringify(body.questions)).not.toMatch(/kimi|gemini|nemotron|nvidia/i);

    // Experimental dataset: version stamps + comparable tiers + attempts.
    expect(logEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'jev_shadow_decision',
      metadata: expect.objectContaining({
        requestId: 'r2',
        status: 'ok',
        decisionPlaneSchemaVersion: 1,
        decisionProvider: 'jev',
        decisionModel: 'jev-1.13.0',
        questionSetVersion: 2,
        tierPolicyVersion: 1,
        productionIntent: 'coding_task',
        jevIntent: 'coding_task',
        agreement: true,
        // capability_requirement 'quality' → jevTier quality.
        jevTier: 'quality',
        // agentMode 'quality' → quality — comparable with jevTier.
        productionTier: 'quality',
        productionModelRef: 'nvidia/nemotron-3-ultra-550b-a55b',
        proposedCapability: 'quality',
        capabilityConfidence: 0.75,
        proposedEffort: 'medium',
        effortConfidence: 0.8,
        riskSignal: 0.2,
        proposedLease: 'one_call',
        leaseConfidence: 0.85,
        jevAttemptCount: 1,
        jevLatencyMs: expect.any(Number),
      }),
    }));
  });

  it('slice 1A: response missing a question ID is NOT evidence → unavailable', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    // Four of five answers returned — the old parser would have called this ok.
    const partial = { ...FULL_ANSWERS } as any;
    delete partial.risk_signal;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse(partial)), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r4', rawInput: 'analyze this' },
      productionDecision: decision('research_task'),
      agentMode: 'reasoning',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    const meta = logEventMock.mock.calls[0][0].metadata;
    expect(meta.status).toBe('unavailable');
    expect(meta.jevIntent).toBeUndefined();
    expect(meta.jevTier).toBeUndefined();
  });

  it('slice 1A: empty answers object is NOT evidence → unavailable', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse({})), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r5', rawInput: 'hello' },
      productionDecision: decision('general_chat'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    expect(logEventMock).toHaveBeenCalledTimes(1);
    expect(logEventMock.mock.calls[0][0].metadata.status).toBe('unavailable');
  });

  it('slice 1A: alias model IDs FAIL the REAL production envSchema', () => {
    // Exercises the actual envSchema from @lattice-os/core — removing or
    // relaxing the real JEV_MODEL constraint makes this fail, unlike a
    // duplicated inline regex.
    const { envSchema } = require('@lattice-os/core');

    const base = { JEV_MODEL: 'jev-1.13.0' };
    expect(envSchema.safeParse({ ...base, JEV_MODEL: 'jev-1.13.0' }).success).toBe(true);
    const alias = envSchema.safeParse({ ...base, JEV_MODEL: 'jev-latest' });
    expect(alias.success).toBe(false);
    const preview = envSchema.safeParse({ ...base, JEV_MODEL: 'jev-preview' });
    expect(preview.success).toBe(false);
    const partial = envSchema.safeParse({ ...base, JEV_MODEL: 'jev-1.13' });
    expect(partial.success).toBe(false);
  });

  it('blocker 1: fast-mode + attachment logs productionTier from the RESOLVED plan (quality), not the mode', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse(FULL_ANSWERS)), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r7', rawInput: 'summarize this attached PDF' },
      // The resolver routes attachments to gemini.quality regardless of mode.
      productionDecision: decision('knowledge_query', 'gemini.quality'),
      agentMode: 'fast',
      hasAttachments: true,
      messageHistoryCount: 0,
    });

    const legacyCalls = logEventMock.mock.calls.filter((c) => c[0].eventType === 'jev_shadow_decision');
    expect(legacyCalls).toHaveLength(1);
    const meta = legacyCalls[0][0].metadata;
    expect(meta.status).toBe('ok');
    // Effective tier from the resolved plan, NOT the requested fast mode.
    expect(meta.productionTier).toBe('quality');
    expect(meta.productionModelRef).toBe('gemini.quality');
  });

  it('blocker 4: a Choice answer outside the submitted criteria is NOT evidence', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    const bogus = {
      ...FULL_ANSWERS,
      task_class: { type: 'choice', choice: 'unsupported', probabilities: { unsupported: 1 }, confidence: 0.9 },
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse(bogus)), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r8', rawInput: 'hello' },
      productionDecision: decision('general_chat'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    const meta = logEventMock.mock.calls[0][0].metadata;
    expect(meta.status).toBe('unavailable');
    expect(meta.jevFailureReason).toBe('response_invalid');
  });

  it('blocker 4: a lease answer outside the submitted criteria is NOT evidence', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    const bogus = {
      ...FULL_ANSWERS,
      route_lease: { type: 'choice', choice: 'weekly', probabilities: { weekly: 1 }, confidence: 0.9 },
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(jevResponse(bogus)), { status: 200 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r9', rawInput: 'hello' },
      productionDecision: decision('general_chat'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    const meta = logEventMock.mock.calls[0][0].metadata;
    expect(meta.status).toBe('unavailable');
    expect(meta.jevFailureReason).toBe('response_invalid');
  });

  it('blocker 3: unavailable events carry failure reason, attempt count, and whole-operation latency', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    // 429, 429, then network rejection — three attempts, measurable burn.
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockRejectedValueOnce(new Error('network down'));

    await shadowEvaluateRouting({
      request: { requestId: 'r10', rawInput: 'hello' },
      productionDecision: decision('general_chat'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    const meta = logEventMock.mock.calls[0][0].metadata;
    expect(meta.status).toBe('unavailable');
    expect(meta.jevFailureReason).toBe('network_error');
    expect(meta.jevAttemptCount).toBe(3);
    expect(meta.jevLatencyMs).toEqual(expect.any(Number));
  });

  it('Jev failure → unavailable telemetry, never an exception', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      shadowEvaluateRouting({
        request: { requestId: 'r3', rawInput: 'hello' },
        productionDecision: decision('general_chat'),
        agentMode: 'fast',
        hasAttachments: false,
        messageHistoryCount: 0,
      })
    ).resolves.toBeUndefined();

    expect(logEventMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'jev_shadow_decision',
      metadata: expect.objectContaining({ status: 'unavailable', requestId: 'r3' }),
    }));
  });

  it('slice 1A: 401 (auth failure) is terminal — one attempt, no retry burn', async () => {
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    fetchMock.mockResolvedValue(
      new Response('{"error":"invalid key"}', { status: 401 })
    );

    await shadowEvaluateRouting({
      request: { requestId: 'r6', rawInput: 'hello' },
      productionDecision: decision('general_chat'),
      agentMode: 'fast',
      hasAttachments: false,
      messageHistoryCount: 0,
    });

    // Terminal 4xx: exactly ONE attempt — retries are for 429/529 only.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logEventMock.mock.calls[0][0].metadata.status).toBe('unavailable');
  });
});