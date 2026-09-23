/**
 * Decision Plane shadow v2 contracts (slice 2).
 *
 * Locks the dataset-generation invariants:
 *   1. All four v2 semantic questions (+ task_class for continuity) are sent
 *      in exactly ONE batched engine call.
 *   2. No provider/model names in dossier state or question wording.
 *   3. capability_requirement choices: fast | quality | reasoning (only).
 *   4. reasoning_effort choices: low | medium | high | max (only).
 *   5. route_lease choices: one_call | tool_chain | user_turn (only).
 *   6. risk_signal never mutates policyContext.deterministicRisk.
 *   7. No root-level confidence on the DecisionEvent.
 *   8. ShadowRoutingPolicy never returns apply|override.
 *   9. Legacy jev_shadow_decision fields remain present.
 *  10. questionSetVersion = 2.
 *  11. Invalid/missing v2 answers → response_invalid, never partial ok.
 *  12. One outbound JEV request remains the invariant.
 */
import { shadowEvaluateRouting, QUESTION_SET_VERSION } from '@/lib/intelligence/decision/shadowRouter';
import { ShadowRoutingPolicy } from '@/lib/intelligence/decision/policies/shadowRoutingPolicy';

const fetchMock = jest.fn();
(globalThis as any).fetch = fetchMock;

const logEventMock = jest.fn();
jest.mock('@/lib/telemetry', () => ({
  logEvent: (...a: any[]) => logEventMock(...a),
}));
jest.mock('@/lib/env', () => ({ env: {} }));

function decision(category = 'coding_task', preferredModelRef = 'gemini.quality') {
  return {
    requestId: 'r1',
    resolvedWorkspaceId: 'ws1',
    intent: { category, confidence: 0.8, subtypes: [], urgency: 'normal' },
    providerPlan: { preferredModelRefs: [preferredModelRef] },
  } as any;
}

const FULL_ANSWERS = {
  task_class: { type: 'choice', choice: 'coding_task', probabilities: { coding_task: 1 }, confidence: 0.9 },
  capability_requirement: { type: 'choice', choice: 'reasoning', probabilities: { reasoning: 0.99 }, confidence: 0.99 },
  reasoning_effort: { type: 'choice', choice: 'max', probabilities: { max: 0.8 }, confidence: 0.8 },
  risk_signal: { type: 'noul', noul: 0.9 },
  route_lease: { type: 'choice', choice: 'tool_chain', probabilities: { tool_chain: 0.7 }, confidence: 0.7 },
};

function setEnv(key: string, value: any) {
  (require('@/lib/env').env as any)[key] = value;
}

async function runOnce(overrides: Record<string, any> = {}) {
  await shadowEvaluateRouting({
    request: { requestId: 'rv2', rawInput: 'refactor the auth module', userId: 'u1', workspaceId: 'ws1' },
    productionDecision: decision(),
    agentMode: 'quality',
    hasAttachments: false,
    messageHistoryCount: 7,
    ...overrides,
  });
}

function events(type: string) {
  return logEventMock.mock.calls.filter((c) => c[0].eventType === type).map((c) => c[0]);
}

describe('decision plane shadow v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEnv('TYPESAFE_API_KEY', 'ts_test');
    setEnv('JEV_MODEL', 'jev-1.13.0');
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ model: 'jev-1.13.0', answers: FULL_ANSWERS, usage: { input_tokens: 512, output_tokens: 0 } }), { status: 200 })
    );
  });

  it('1+12: all four v2 questions present in exactly ONE batched engine call', async () => {
    await runOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(Object.keys(body.questions).sort()).toEqual([
      'capability_requirement', 'reasoning_effort', 'risk_signal', 'route_lease', 'task_class',
    ]);
  });

  it('2: no provider/model names in dossier state or question wording', async () => {
    await runOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = /kimi|gemini|nemotron|nvidia|deepseek|claude|gpt/i;
    expect(JSON.stringify(body.state)).not.toMatch(names);
    expect(JSON.stringify(body.questions)).not.toMatch(names);
  });

  it('3+4+5: choice options are exactly the v2 sets', async () => {
    await runOnce();
    const q = JSON.parse(fetchMock.mock.calls[0][1].body).questions;
    expect(Object.keys(q.capability_requirement.criteria).sort()).toEqual(['fast', 'quality', 'reasoning']);
    expect(Object.keys(q.reasoning_effort.criteria).sort()).toEqual(['high', 'low', 'max', 'medium']);
    expect(Object.keys(q.route_lease.criteria).sort()).toEqual(['one_call', 'tool_chain', 'user_turn']);
  });

  it('6: risk_signal is semantic-only; dossier/policyContext carry no deterministic risk facts it could overwrite', async () => {
    await runOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Authority facts never leave as semantic state for the engine to rediscover.
    expect(JSON.stringify(body.state)).not.toMatch(/deterministicRisk|approvalRequired|destructiveOperation|externalSideEffect/);
    // The policy got passthrough/abstain only — risk_signal (noul 0.9) never applied.
    const de = events('decision_event')[0];
    expect(de.metadata.policyOutcome.action).not.toBe('apply');
    expect(de.metadata.policyOutcome.action).not.toBe('override');
    const meta = events('jev_shadow_decision')[0].metadata;
    expect(meta.riskSignal).toBe(0.9); // recorded as a signal, nothing more
  });

  it('7: DecisionEvent carries no root-level confidence', async () => {
    await runOnce();
    const de = events('decision_event')[0];
    expect('confidence' in de.metadata).toBe(false);
    expect('overallConfidence' in de.metadata).toBe(false);
    expect('confidence' in de.metadata.outcome).toBe(false);
  });

  it('8: ShadowRoutingPolicy returns only passthrough (valid) / abstain (invalid)', async () => {
    const p = new ShadowRoutingPolicy();
    expect(p.evaluate({} as any, { ok: true } as any, {}).action).toBe('passthrough');
    expect(p.evaluate({} as any, { ok: false } as any, {}).action).toBe('abstain');
    for (const { action } of [p.evaluate({} as any, { ok: true } as any, {}), p.evaluate({} as any, { ok: false } as any, {})]) {
      expect(action === 'apply' || action === 'override').toBe(false);
    }
    // Even a max-confidence reasoning proposal does nothing.
    await runOnce();
    const legacy = events('jev_shadow_decision')[0].metadata;
    expect(legacy.proposedCapability).toBe('reasoning');
    expect(legacy.capabilityConfidence).toBe(0.99);
    expect(legacy.policyAction).toBe('passthrough');
  });

  it('9: legacy telemetry fields remain present (additive migration overlap)', async () => {
    await runOnce();
    const meta = events('jev_shadow_decision')[0].metadata;
    for (const k of [
      'productionIntent', 'jevIntent', 'jevTier', 'productionTier', 'productionModelRef',
      'jevLatencyMs', 'jevAttemptCount', 'jevInputTokens', 'policyAction', 'policyReasonCode',
    ]) {
      expect(meta).toHaveProperty(k);
    }
    // decision_event emitted in parallel, not as a replacement.
    expect(events('decision_event')).toHaveLength(1);
    expect(events('jev_shadow_decision')).toHaveLength(1);
  });

  it('10: questionSetVersion is 2 on both streams', async () => {
    await runOnce();
    expect(events('jev_shadow_decision')[0].metadata.questionSetVersion).toBe(2);
    expect(events('decision_event')[0].metadata.questionSetVersion).toBe(2);
    expect(QUESTION_SET_VERSION).toBe(2);
  });

  it('11: missing/invalid v2 answers → response_invalid, never partial ok', async () => {
    for (const bad of [
      { ...FULL_ANSWERS, capability_requirement: undefined },
      { ...FULL_ANSWERS, route_lease: { type: 'choice', choice: 'forever', probabilities: {}, confidence: 0.5 } },
      { ...FULL_ANSWERS, risk_signal: { type: 'choice', choice: 'high', probabilities: {}, confidence: 0.5 } },
    ]) {
      jest.clearAllMocks();
      const answers = Object.fromEntries(Object.entries(bad).filter(([, v]) => v !== undefined));
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ model: 'jev-1.13.0', answers, usage: { input_tokens: 1 } }), { status: 200 })
      );
      await runOnce();
      const meta = events('jev_shadow_decision')[0].metadata;
      expect(meta.status).toBe('unavailable');
      expect(meta.jevFailureReason).toBe('response_invalid');
      expect(events('decision_event')).toHaveLength(0);
    }
  });

  it('dossier state carries v2 semantic context fields', async () => {
    await runOnce();
    const state = JSON.parse(fetchMock.mock.calls[0][1].body).state;
    expect(state.has_tool_candidates).toBe(true); // coding_task
    expect(state.estimated_context_size_band).toBe('medium'); // 7 messages
    expect(state.continuation_kind).toBe('continuation');
    expect(state.conversation_length_so_far).toBe(7);
  });
});
