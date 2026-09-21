// lib/intelligence/decision/provider.ts
// DecisionProvider — the sovereign seam between Lattice and any System One
// (decision) model. UCOL depends on THIS interface, never on a vendor SDK.
//
// Design rule (locked): the decision model provides semantic EVIDENCE only.
// Lattice policy owns authority. Nothing in this module executes anything,
// and nothing outside it may treat a decision as permission.
//
// Hardening (slice 1A):
//   - Strict Zod validation of the full response; ALL submitted question IDs
//     must be present and correctly typed, otherwise the result is NOT
//     evidence (null). An empty answers object can never become status:ok.
//   - One end-to-end deadline across all attempts; each retry gets only the
//     remaining budget. latencyMs measures the whole operation (retries +
//     backoff included), not just the successful attempt.
//   - Retries only on explicitly transient statuses (429/529). Auth,
//     validation, and other 4xx/5xx terminate immediately.
//   - Model pin enforced in the schema, not comments: version-shaped IDs
//     only (jev-1.13.0); aliases like jev-latest fail env validation.

import { z } from 'zod';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// ── Question schemas (one per TypeSafe primitive) ─────────────────────────────

export const ChoiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: z.string().min(1),
  criteria: z.record(z.string(), z.union([z.string(), z.null()])),
});
export const ScoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(2),
});
export const NoulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: z.string().min(1),
  criteria: z.object({ true: z.string().optional(), false: z.string().optional() }).optional(),
});

export const QuestionSchema = z.discriminatedUnion('type', [
  ChoiceQuestionSchema,
  ScoreQuestionSchema,
  NoulQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;
export type Questions = Record<string, Question>;

// ── Answer shapes ─────────────────────────────────────────────────────────────

export interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
export interface ScoreAnswer { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number }
export interface NoulAnswer { type: 'noul'; noul: number }
export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface DecisionResult {
  model: string;
  answers: Record<string, Answer>;
  usage: { inputTokens: number; outputTokens: number };
  /** Whole-operation latency including retries/backoff (p50/p95 input). */
  latencyMs: number;
  /** Number of HTTP attempts made (>=1). */
  attemptCount: number;
}

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
 * an answer of the matching type. Missing/mistyped answers → null (the
 * caller never sees partial evidence).
 */
function validateEvidence(
  parsed: z.infer<typeof JevResponseSchema>,
  questions: Questions,
): Record<string, Answer> | null {
  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const raw = parsed.answers[id];
    if (!raw) return null; // missing question id → not evidence
    // Type match enforced by the union parse above; re-check the pairing
    // explicitly so a choice answer to a noul question can't slip through.
    if (raw.type !== question.type) return null;
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

/**
 * Direct-HTTP Jev adapter. Pinned version, env-gated, returns null on ANY
 * failure or incomplete response: callers treat null as "no evidence",
 * never as an error.
 */
export async function jevEvaluate(
  state: string | object,
  questions: Questions,
): Promise<DecisionResult | null> {
  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  const body = JSON.stringify({
    state,
    model: env.JEV_MODEL,
    questions,
  });

  const startedAt = Date.now();
  const deadline = startedAt + JEV_BUDGET_MS;

  for (let attempt = 1; attempt <= JEV_RETRIES + 1; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
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
        // Backoff bounded by the remaining end-to-end budget.
        const backoff = Math.min(300 * 2 ** attempt + Math.random() * 200, Math.max(0, deadline - Date.now()));
        if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!res.ok) {
        // Non-transient failure (401/403/422/5xx-except-529): terminal.
        logger.warn('[DecisionPlane] Jev HTTP error (terminal)', { status: res.status, attempt });
        return null;
      }

      const json: unknown = await res.json();
      const parsed = JevResponseSchema.safeParse(json);
      if (!parsed.success) {
        logger.warn('[DecisionPlane] Jev response failed schema validation', { attempt });
        return null;
      }
      const answers = validateEvidence(parsed.data, questions);
      if (!answers) {
        logger.warn('[DecisionPlane] Jev response missing/mistyped question answers', { attempt });
        return null;
      }

      return {
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
      // Timeout/abort/network — retry if budget remains, else give up.
      if (attempt > JEV_RETRIES || Date.now() >= deadline) {
        logger.warn('[DecisionPlane] Jev unreachable:', err?.message || String(err));
        return null;
      }
    }
  }
  return null;
}
