// lib/intelligence/decision/engines/jev.ts
// JevDecisionEngine — the FIRST engine plugged into Lattice's decision
// architecture. One implementation of the neutral DecisionEngine contract;
// UCOL never imports this directly (it receives an engine instance).
//
// All HTTP/budget/retry/validation behavior is exactly the slice-1A
// implementation, relocated verbatim from provider.ts. Zero behavior change.

import { z } from 'zod';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type {
  DecisionDossier, DecisionEngine, DecisionOutcome,
  Questions, Answer, ChoiceAnswer, ScoreAnswer, NoulAnswer,
} from '../contracts';

// ── Response validation: a response is evidence ONLY if complete ─────────────

const ChoiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string().min(1),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});
const ScoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number(),
  legend: z.record(z.string(), z.string()),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});
const NoulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
});
const AnswerMapSchema = z.record(z.string(), z.union([ChoiceAnswerSchema, ScoreAnswerSchema, NoulAnswerSchema]));

const JevResponseSchema = z.object({
  model: z.string().min(1),
  answers: AnswerMapSchema,
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative().optional().default(0),
  }),
});

/**
 * A response is evidence only if EVERY submitted question ID came back with
 * an answer of the matching type AND semantically valid against the question:
 * choice ∈ submitted criteria keys; score within the submitted scale.
 */
function validateEvidence(
  parsed: z.infer<typeof JevResponseSchema>,
  questions: Questions,
): Record<string, Answer> | null {
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const raw = parsed.answers[id];
    if (!raw) return null;
    if (raw.type !== question.type) return null;

    if (raw.type === 'choice' && question.type === 'choice') {
      if (!(raw.choice in question.criteria)) return null;
    }
    if (raw.type === 'score' && question.type === 'score') {
      const maxLevel = question.criteria.length - 1;
      if (raw.score < 0 || raw.score > maxLevel) return null;
    }
    answers[id] = raw as Answer;
  }
  return answers;
}

// ponytail: 6s end-to-end budget (3 attempts) — a decision plane that adds
// latency is worse than none. Shadow mode never blocks the response path
// (waitUntil); production gating later must raise this deliberately.
const JEV_BUDGET_MS = 6_000;
const JEV_RETRIES = 2;
const RETRYABLE_STATUSES = new Set([429, 529]);

/** Direct-HTTP Jev engine. Pinned version, env-gated, discriminated outcome. */
export class JevDecisionEngine implements DecisionEngine {
  readonly id = 'jev';
  readonly model: string;

  constructor() {
    this.model = env.JEV_MODEL ?? 'jev-1.13.0';
  }

  async evaluate(
    dossier: DecisionDossier,
    questions: Questions,
  ): Promise<DecisionOutcome> {
    const apiKey = env.TYPESAFE_API_KEY;
    if (!apiKey) return { ok: false, reason: 'no_api_key', latencyMs: 0, attemptCount: 0 };

    const body = JSON.stringify({
      state: dossier.state,
      model: this.model,
      questions,
    });

    const startedAt = Date.now();
    const deadline = startedAt + JEV_BUDGET_MS;
    let attempts = 0;

    for (let attempt = 1; attempt <= JEV_RETRIES + 1; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return { ok: false, reason: 'budget_exhausted', latencyMs: Date.now() - startedAt, attemptCount: attempts };
      }

      try {
        attempts = attempt;
        const res = await fetch('https://api.typesafe.ai/v1/systemone', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body,
          signal: AbortSignal.timeout(remaining),
        });

        if (RETRYABLE_STATUSES.has(res.status)) {
          if (attempt > JEV_RETRIES) break;
          const backoff = Math.min(300 * 2 ** attempt + Math.random() * 200, Math.max(0, deadline - Date.now()));
          if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        if (!res.ok) {
          logger.warn('[DecisionPlane] Jev HTTP error (terminal)', { status: res.status, attempt });
          return { ok: false, reason: 'http_terminal', latencyMs: Date.now() - startedAt, attemptCount: attempt };
        }

        const json: unknown = await res.json();
        const parsed = JevResponseSchema.safeParse(json);
        if (!parsed.success) {
          logger.warn('[DecisionPlane] Jev response failed schema validation', { attempt });
          return { ok: false, reason: 'response_invalid', latencyMs: Date.now() - startedAt, attemptCount: attempt };
        }
        const answers = validateEvidence(parsed.data, questions);
        if (!answers) {
          logger.warn('[DecisionPlane] Jev response missing/mistyped/out-of-domain answers', { attempt });
          return { ok: false, reason: 'response_invalid', latencyMs: Date.now() - startedAt, attemptCount: attempt };
        }

        return {
          ok: true,
          model: parsed.data.model,
          answers,
          usage: {
            inputTokens: parsed.data.usage.input_tokens,
            outputTokens: parsed.data.usage.output_tokens,
          },
          latencyMs: Date.now() - startedAt,
          attemptCount: attempt,
        };
      } catch (err: any) {
        if (attempt > JEV_RETRIES || Date.now() >= deadline) {
          logger.warn('[DecisionPlane] Jev unreachable:', err?.message || String(err));
          return { ok: false, reason: 'network_error', latencyMs: Date.now() - startedAt, attemptCount: attempt };
        }
      }
    }
    return { ok: false, reason: 'budget_exhausted', latencyMs: Date.now() - startedAt, attemptCount: Math.max(attempts, 1) };
  }
}
