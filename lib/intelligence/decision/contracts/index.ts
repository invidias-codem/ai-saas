// lib/intelligence/decision/contracts/index.ts
// Lattice Decision Plane — neutral contracts.
//
// ARCHITECTURAL RULE (repo-level, locked):
//   Probabilistic intelligence PROPOSES.
//   Deterministic policy GRANTS AUTHORITY.
//   Validated execution PERFORMS.
//   Evidence RECORDS what actually happened.
//
// Dependency direction (locked):
//   UCOL → DecisionEngine / DecisionPolicy interfaces → implementations.
//   UCOL never depends on a concrete engine (e.g. JevDecisionEngine).
//
// Hard constraints encoded here:
//   - NO root-level `confidence` on results: probabilities stay attached to
//     their specific judgments. A universal confidence field invites
//     `if (confidence < 0.7) fallback()` — recreating the architecture this
//     plane replaces. Policy interpretation lives with each decision family.
//   - Risk supplied as FACT (policyContext.deterministicRisk) is separate
//     from risk inferred semantically (engine judgments). Facts outrank
//     semantic interpretation.
//   - Engines may only SELECT from submitted candidates — never invent.

import { z } from 'zod';

// ── Dossier: what any decision is made ABOUT ─────────────────────────────────

export const DecisionPhaseSchema = z.enum(['plan', 'implement', 'verify', 'review', 'execute']);
export type DecisionPhase = z.infer<typeof DecisionPhaseSchema>;

export const DecisionLeaseSchema = z.enum(['one_call', 'tool_chain', 'user_turn']);
export type DecisionLease = z.infer<typeof DecisionLeaseSchema>;

/** FACTS about policy context — supplied by deterministic Lattice state. */
export const PolicyContextSchema = z.object({
  /** Risk classified by RULES (tool type, blast radius) — never by semantics. */
  deterministicRisk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  approvalRequired: z.boolean().optional(),
  destructiveOperation: z.boolean().optional(),
  externalSideEffect: z.boolean().optional(),
});
export type PolicyContext = z.infer<typeof PolicyContextSchema>;

export const DecisionDossierV1Schema = z.object({
  schemaVersion: z.literal(1),
  /** Consumer family: routing | contextSieve | evidenceGate | actionGateway | traversal */
  consumer: z.string().min(1),
  task: z.object({
    goal: z.string().min(1),
    phase: DecisionPhaseSchema,
  }),
  /** Facts about the world, already redacted for egress. */
  state: z.record(z.string(), z.unknown()),
  /** Candidates the engine may select from (empty = pure judgment, no selection). */
  candidates: z.array(z.object({
    id: z.string().min(1),
    description: z.string().optional(),
  })).default([]),
  /** Deterministic facts that outrank any semantic inference. */
  policyContext: PolicyContextSchema.default({}),
  requestId: z.string().min(1),
});
export type DecisionDossier = z.infer<typeof DecisionDossierV1Schema>;

// ── Questions: typed judgments an engine answers about a dossier ─────────────

export const ChoiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: z.string().min(1),
  // Choice = select from named options; empty criteria is an impossible
  // contract (validateEvidence requires the answer to be a key). Pure
  // judgments without named options use noul/score instead.
  criteria: z.record(z.string(), z.union([z.string(), z.null()])).refine(
    (c) => Object.keys(c).length > 0,
    { message: 'choice criteria must contain at least one option' },
  ),
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
  ChoiceQuestionSchema, ScoreQuestionSchema, NoulQuestionSchema,
]);
export type Question = z.infer<typeof QuestionSchema>;
export type Questions = Record<string, Question>;

// ── Results: probabilities attached to their judgments, never a root confidence ──

export interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
export interface ScoreAnswer { type: 'score'; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number }
export interface NoulAnswer { type: 'noul'; noul: number }
export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/** Discriminated outcome: failures carry reason + attempts + latency. */
export type DecisionFailureReason =
  | 'no_api_key'
  | 'budget_exhausted'
  | 'http_terminal'
  | 'response_invalid'
  | 'network_error';

export type DecisionOutcome =
  | {
      ok: true;
      model: string;
      answers: Record<string, Answer>;
      usage: { inputTokens: number; outputTokens: number };
      latencyMs: number;
      attemptCount: number;
    }
  | { ok: false; reason: DecisionFailureReason; latencyMs: number; attemptCount: number };

// ── Engine: proposes judgments; never grants authority ───────────────────────

export interface DecisionEngine {
  readonly id: string;
  readonly model: string;
  /**
   * Evaluate typed questions against a dossier. Engines are PROPOSERS:
   * the result is semantic evidence for policy, never permission.
   */
  evaluate(
    dossier: DecisionDossier,
    questions: Questions,
  ): Promise<DecisionOutcome>;
}

// ── Policy: the authority boundary ───────────────────────────────────────────

export type PolicyOutcome =
  | { action: 'apply'; reasonCode: string }
  | { action: 'override'; reasonCode: string }
  | { action: 'abstain'; reasonCode: string }
  | { action: 'passthrough'; reasonCode: string }
  | { action: 'reobserve'; reasonCode: string };

export interface DecisionPolicy {
  readonly id: string;
  readonly version: string;
  /**
   * PURE function whenever practical: (dossier, judgment, deterministic
   * state) → PolicyOutcome. No network, no DB mutation, no execution.
   * Purity makes policy REPLAYABLE — "what would Policy v7 have done on last
   * month's traffic?" — without rerunning user workloads.
   */
  evaluate(
    dossier: DecisionDossier,
    judgment: DecisionOutcome,
    deterministicState: Record<string, unknown>,
  ): PolicyOutcome;
}

// ── Event: the evidence record ──────────────────────────────────────────────

export interface DecisionEvent {
  planeSchemaVersion: number;
  consumer: string;
  engineId: string;
  engineModel: string;
  policyId: string;
  policyVersion: string;
  questionSetVersion: number;
  requestId: string;
  /** Normalized in slice 2+ alongside the legacy jev_shadow_decision stream. */
  outcome: DecisionOutcome;
  policyOutcome?: PolicyOutcome;
  proposedLease?: DecisionLease;
}
