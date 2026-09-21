// lib/intelligence/decision/provider.ts
// DecisionProvider — the sovereign seam between Lattice and any System One
// (decision) model. UCOL depends on THIS interface, never on a vendor SDK.
//
// Design rule (locked): the decision model provides semantic EVIDENCE only.
// Lattice policy owns authority. Nothing in this module executes anything,
// and nothing outside it may treat a decision as permission.

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
  latencyMs: number;
}

// ponytail: 2 retries + 3s hard timeout — a decision plane that adds latency
// to the request path is worse than no decision plane. Shadow mode never
// blocks; production gating later must raise this budget deliberately.
const JEV_TIMEOUT_MS = 3_000;
const JEV_RETRIES = 2;

/**
 * Direct-HTTP Jev adapter (no vendor SDK dependency for a 4-field JSON POST).
 * POST /v1/systemone — pinned model, env-gated. Returns null on ANY failure:
 * callers treat null as "no evidence", never as an error.
 */
export async function jevEvaluate(
  state: string | object,
  questions: Questions,
): Promise<DecisionResult | null> {
  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) return null;

  const body = JSON.stringify({
    state,
    model: env.JEV_MODEL ?? 'jev-1.13.0',
    questions,
  });

  for (let attempt = 0; attempt <= JEV_RETRIES; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
      });

      if (res.status === 429 || res.status === 529) {
        // Rate limit / overloaded — back off (SDKs honor retry-after; we
        // approximate with exponential jitter).
        if (attempt === JEV_RETRIES) break;
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
        continue;
      }

      if (!res.ok) {
        logger.warn('[DecisionPlane] Jev HTTP error', { status: res.status, attempt });
        if (attempt === JEV_RETRIES) return null;
        continue;
      }

      const json: any = await res.json();
      const answers: Record<string, Answer> = {};
      for (const [key, a] of Object.entries(json.answers ?? {})) {
        const ans = a as any;
        if (ans.type === 'choice') {
          answers[key] = { type: 'choice', choice: ans.choice, probabilities: ans.probabilities ?? {}, confidence: ans.confidence ?? 0 };
        } else if (ans.type === 'score') {
          answers[key] = { type: 'score', score: ans.score, legend: ans.legend ?? {}, probabilities: ans.probabilities ?? {}, confidence: ans.confidence ?? 0 };
        } else if (ans.type === 'noul') {
          answers[key] = { type: 'noul', noul: ans.noul };
        }
      }
      return {
        model: json.model ?? 'unknown',
        answers,
        usage: { inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 },
        latencyMs: Date.now() - started,
      };
    } catch (err: any) {
      if (attempt === JEV_RETRIES) {
        logger.warn('[DecisionPlane] Jev unreachable:', err?.message || String(err));
        return null;
      }
    }
  }
  return null;
}
