// lib/intelligence/decision/shadowRouter.ts
// SHADOW-ONLY evaluation of UCOL routing decisions through the neutral
// Decision Plane. Zero production behavior change (contract extraction PR:
// behavior identical to the slice-1A Jev implementation, relocated behind
// DecisionEngine/DecisionPolicy so UCOL depends on contracts, not Jev).
//
// Flow (locked): engine proposes → policy decides → telemetry records.
// The legacy jev_shadow_decision event shape is UNCHANGED so the running
// calibration baseline stays continuous.

import { logEvent } from '@/lib/telemetry';
import { env } from '@/lib/env';
import { scrubText } from '@/lib/security/pii';
import type { UcolRoutingDecision } from '@/lib/ucol/routing/types';
import type { DecisionDossier, Questions } from './contracts';
import { JevDecisionEngine } from './engines/jev';
import { ShadowRoutingPolicy } from './policies/shadowRoutingPolicy';

// Experimental-dataset version stamps. Bump on ANY change to question
// wording, tier mapping, or comparison logic.
export const DECISION_PLANE_SCHEMA_VERSION = 1;
export const QUESTION_SET_VERSION = 1;
export const TIER_POLICY_VERSION = 1;
export const DECISION_PROVIDER_ID = 'jev';

// Bandit action space (lib/ucol/routing/decision.ts) — the engine classifies
// into the SAME labels so agreement is directly measurable.
const TASK_CLASSES = {
  general_chat: 'Casual conversation, greetings, chit-chat, simple questions answerable from general knowledge',
  coding_task: 'Writing, modifying, debugging, or explaining code; building apps or features; technical implementation work',
  research_task: 'Multi-source research, comparison, analysis, architecture evaluation, strategy, planning',
  knowledge_query: 'A specific factual question the user expects answered from stored knowledge, documents, or memory',
  agentic_task: 'Multi-step work the user expects to be carried out autonomously with tools (browsing, file ops, executing workflows)',
} as const;

// Model tiers derived in CODE from the engine's semantic outputs (never asked
// of the engine). Uses the provider resolver's own tier vocabulary
// (fast|quality|reasoning) so the comparison against the production tier is
// apples-to-apples.
function tierFromSemantics(answers: Record<string, any>): string {
  const complexity = answers.task_complexity as any; // score answer
  const reasoning = (answers.requires_strong_reasoning as any)?.noul ?? 0;
  // score: 0=trivial 1=standard 2=complex 3=deep
  const level = complexity?.score ?? 1;
  if (level >= 2.5 || reasoning > 0.7) return 'reasoning';
  if (level >= 1.5) return 'quality';
  return 'fast';
}

/**
 * Production tier derived from the RESOLVED provider plan — the resolver's
 * own vocabulary, not the requested mode. preferredModelRefs suffix IS the
 * effective tier (gemini.quality / deepseek.fast / nvidia-nim.agentic→reasoning).
 */
function productionTierFromPlan(
  providerPlan: UcolRoutingDecision['providerPlan'] | undefined,
  agentMode: string,
): string {
  const ref = providerPlan?.preferredModelRefs?.[0];
  if (ref) {
    const suffix = ref.split('.').pop() ?? '';
    if (suffix === 'fast' || suffix === 'quality' || suffix === 'reasoning' || suffix === 'agentic') {
      return suffix === 'agentic' ? 'reasoning' : suffix;
    }
  }
  switch (agentMode) {
    case 'reasoning':
    case 'agentic':
      return 'reasoning';
    case 'quality':
      return 'quality';
    default:
      return 'fast';
  }
}

// ponytail: engine + policy are module singletons — stateless, shareable.
// A future engine-swap (JEV 1.14, local classifier) changes these two lines
// and nothing else in UCOL.
const engine = new JevDecisionEngine();
const policy = new ShadowRoutingPolicy();

/**
 * Shadow evaluation — the WHOLE operation (engine evaluation + policy
 * evaluation + telemetry write) is registered with waitUntil by the caller.
 * Zero latency on the user-visible path.
 */
export function shadowEvaluateRouting(args: {
  request: { requestId: string; rawInput: string; userId?: string; workspaceId?: string };
  productionDecision: UcolRoutingDecision;
  agentMode: string;
  hasAttachments: boolean;
  messageHistoryCount: number;
}): Promise<void> {
  // No key → no shadow (the plane is inert without configuration).
  if (!env.TYPESAFE_API_KEY) return Promise.resolve();

  // Egress hygiene: redact secrets/PII before anything leaves Lattice.
  const redactedInput = scrubText(args.request.rawInput).slice(0, 4_000);

  const dossier: DecisionDossier = {
    schemaVersion: 1,
    consumer: 'routing',
    task: {
      goal: 'Classify the user request and its capability requirements',
      phase: 'plan',
    },
    state: {
      user_request: redactedInput,
      conversation_length_so_far: args.messageHistoryCount,
      has_file_attachments: args.hasAttachments,
      workspace_backed: Boolean(args.productionDecision.resolvedWorkspaceId),
      user_selected_mode: args.agentMode,
    },
    candidates: [],
    policyContext: {},
    requestId: args.request.requestId,
  };

  const questions: Questions = {
    task_class: {
      type: 'choice',
      instructions: 'Which category of work is this user request?',
      criteria: { ...TASK_CLASSES },
    },
    task_complexity: {
      type: 'score',
      instructions: 'How complex is satisfying this request?',
      criteria: [
        'Trivial: a one-line reply or single fact suffices',
        'Standard: a normal multi-sentence answer',
        'Complex: multi-part reasoning, careful structure, or iteration',
        'Deep: expert-level, multi-step, or large-context analysis',
      ],
    },
    requires_tools: {
      type: 'noul',
      instructions: 'Does satisfying this request require external tools (search, files, browser, code execution)?',
      criteria: {
        true: 'Tools are needed to complete it',
        false: 'It can be answered from the conversation alone',
      },
    },
    requires_long_context: {
      type: 'noul',
      instructions: 'Does this require reading a large amount of prior conversation or documents?',
    },
    requires_strong_reasoning: {
      type: 'noul',
      instructions: 'Does this request require strong, careful reasoning to answer well?',
    },
  };

  return (async () => {
    const outcome = await engine.evaluate(dossier, questions);
    // Policy is pure — evaluated for the record (shadow: never applied).
    const policyOutcome = policy.evaluate(dossier, outcome, {
      productionIntent: args.productionDecision.intent.category,
    });

    if (!outcome.ok) {
      logEvent({
        eventType: 'jev_shadow_decision',
        userId: args.request.userId,
        workspaceId: args.request.workspaceId,
        metadata: {
          requestId: args.request.requestId,
          status: 'unavailable',
          jevFailureReason: outcome.reason,
          jevAttemptCount: outcome.attemptCount,
          jevLatencyMs: outcome.latencyMs,
          productionIntent: args.productionDecision.intent.category,
          decisionPlaneSchemaVersion: DECISION_PLANE_SCHEMA_VERSION,
          decisionProvider: DECISION_PROVIDER_ID,
          decisionModel: env.JEV_MODEL,
          questionSetVersion: QUESTION_SET_VERSION,
          tierPolicyVersion: TIER_POLICY_VERSION,
          policyAction: policyOutcome.action,
          policyReasonCode: policyOutcome.reasonCode,
        },
      });
      return;
    }

    const taskClass = outcome.answers.task_class as any;
    const jevIntent = (taskClass?.choice ?? 'unknown') as string;
    const agreement = jevIntent === args.productionDecision.intent.category;
    const jevTier = tierFromSemantics(outcome.answers);
    const productionTier = productionTierFromPlan(args.productionDecision.providerPlan, args.agentMode);

    logEvent({
      eventType: 'jev_shadow_decision',
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      metadata: {
        requestId: args.request.requestId,
        status: 'ok',
        decisionPlaneSchemaVersion: DECISION_PLANE_SCHEMA_VERSION,
        decisionProvider: DECISION_PROVIDER_ID,
        decisionModel: outcome.model,
        questionSetVersion: QUESTION_SET_VERSION,
        tierPolicyVersion: TIER_POLICY_VERSION,
        productionIntent: args.productionDecision.intent.category,
        jevIntent,
        agreement,
        jevConfidence: taskClass?.confidence ?? null,
        jevTier,
        productionTier,
        productionModelRef: args.productionDecision.providerPlan?.preferredModelRefs?.[0] ?? null,
        complexityScore: (outcome.answers.task_complexity as any)?.score ?? null,
        requiresToolsNoul: (outcome.answers.requires_tools as any)?.noul ?? null,
        requiresLongContextNoul: (outcome.answers.requires_long_context as any)?.noul ?? null,
        requiresStrongReasoningNoul: (outcome.answers.requires_strong_reasoning as any)?.noul ?? null,
        jevLatencyMs: outcome.latencyMs,
        jevAttemptCount: outcome.attemptCount,
        jevInputTokens: outcome.usage.inputTokens,
        policyAction: policyOutcome.action,
        policyReasonCode: policyOutcome.reasonCode,
      },
    });
  })().catch(() => { /* telemetry must never throw */ });
}
