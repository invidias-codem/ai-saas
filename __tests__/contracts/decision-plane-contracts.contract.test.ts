/**
 * Decision Plane contract tests — the architectural rules themselves.
 *
 * Locks:
 *   1. NO root-level confidence on outcomes: probabilities stay attached to
 *      their specific judgments. A universal confidence field invites
 *      `if (confidence < 0.7) fallback()` — the architecture this plane
 *      replaces.
 *   2. Engines may only SELECT from submitted candidates — a choice outside
 *      the criteria set is not evidence.
 *   3. Policy is pure: (dossier, judgment, state) → PolicyOutcome, no I/O.
 *   4. Dossier separates FACTS (policyContext) from semantic inference.
 *   5. DecisionDossierV1 schema enforces the same rules at the boundary.
 */
import {
  DecisionDossierV1Schema,
  PolicyContextSchema,
  QuestionSchema,
  type DecisionDossier,
  type DecisionOutcome,
  type Questions,
} from '@/lib/intelligence/decision/contracts';
import { ShadowRoutingPolicy } from '@/lib/intelligence/decision/policies/shadowRoutingPolicy';

function okOutcome(): DecisionOutcome {
  return {
    ok: true,
    model: 'jev-1.13.0',
    answers: {
      task_class: { type: 'choice', choice: 'coding_task', probabilities: { coding_task: 0.9 }, confidence: 0.9 },
    },
    usage: { inputTokens: 100, outputTokens: 0 },
    latencyMs: 50,
    attemptCount: 1,
  };
}

function dossier(): DecisionDossier {
  return {
    schemaVersion: 1,
    consumer: 'routing',
    task: { goal: 'classify', phase: 'plan' },
    state: { user_request: 'fix the bug' },
    candidates: [],
    policyContext: { deterministicRisk: 'low', approvalRequired: false },
    requestId: 'r1',
  };
}

describe('decision plane contracts', () => {
  it('rule 1: outcomes carry NO root-level confidence — probabilities stay per-judgment', () => {
    const outcome = okOutcome();
    expect('confidence' in outcome).toBe(false);
    // Per-judgment probability remains — policy reads it from the specific
    // question, never from a universal field. Explicit guard: jest's
    // expect().toBe(true) does not narrow the discriminated union for TS.
    if (!outcome.ok) {
      throw new Error('expected successful decision outcome');
    }
    const jc = outcome.answers.task_class;
    if (jc.type !== 'choice') {
      throw new Error('expected choice answer');
    }
    expect(typeof jc.confidence).toBe('number');
  });

  it('rule 2: question schemas reject candidate invention surfaces', () => {
    // A choice question's criteria ARE the candidate set; validation
    // (engines/jev.ts validateEvidence) rejects choices outside it. The
    // schema itself requires criteria for every choice question.
    const q = QuestionSchema.safeParse({
      type: 'choice',
      instructions: 'pick',
      criteria: { a: 'option a', b: 'option b' },
    });
    expect(q.success).toBe(true);
    const noCriteria = QuestionSchema.safeParse({ type: 'choice', instructions: 'pick', criteria: {} });
    // Empty criteria = nothing to select from: an impossible contract, since
    // validateEvidence requires the answer to be a criteria key. Rejected at
    // the schema boundary; pure judgments use noul/score instead.
    expect(noCriteria.success).toBe(false);
  });

  it('rule 3: policy is pure — same inputs always produce the same outcome', () => {
    const p = new ShadowRoutingPolicy();
    const d = dossier();
    const j = okOutcome();
    const s = { productionIntent: 'coding_task' };

    const r1 = p.evaluate(d, j, s);
    const r2 = p.evaluate(d, j, s);
    expect(r1).toEqual(r2);
    // Shadow mode never applies: production decision retained.
    expect(r1.action).toBe('passthrough');
    expect(r1.reasonCode).toBe('shadow_mode_production_decision_retained');

    const fail = p.evaluate(d, { ok: false, reason: 'response_invalid', latencyMs: 5, attemptCount: 1 }, s);
    expect(fail.action).toBe('abstain');
    expect(fail.reasonCode).toBe('shadow_no_evidence');
  });

  it('rule 4: dossier separates deterministic FACTS from semantic state', () => {
    const d = DecisionDossierV1Schema.parse(dossier());
    // Facts live in policyContext — separately queryable, outranking inference.
    expect(d.policyContext.deterministicRisk).toBe('low');
    expect(d.policyContext.approvalRequired).toBe(false);
    // Risk levels are the deterministic vocabulary, not engine output.
    expect(PolicyContextSchema.safeParse({ deterministicRisk: 'critical' }).success).toBe(true);
    expect(PolicyContextSchema.safeParse({ deterministicRisk: 'extreme' }).success).toBe(false);
  });

  it('rule 5: dossier schema rejects malformed entries at the boundary', () => {
    expect(DecisionDossierV1Schema.safeParse({}).success).toBe(false); // missing everything
    expect(DecisionDossierV1Schema.safeParse(dossier()).success).toBe(true);
    // Unknown schema versions are rejected — versioned evolution only.
    const v2 = { ...dossier(), schemaVersion: 2 };
    expect(DecisionDossierV1Schema.safeParse(v2).success).toBe(false);
  });
});
