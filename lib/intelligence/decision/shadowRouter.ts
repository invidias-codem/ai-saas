// lib/intelligence/decision/shadowRouter.ts
// SHADOW-ONLY Jev evaluation of UCOL routing decisions. Slice 1 of the
// decision-plane rollout: zero production behavior change.
//
// Slice 1A hardening:
//   - Returns the full promise; the call site registers it with waitUntil so
//     Vercel cannot terminate the function before the decision + telemetry
//     write complete. (A detached promise inflated the "unavailable" rate
//     with serverless-termination noise.)
//   - State is redacted (scrubText) before egress — the same PII scrubbing
//     used everywhere else in Lattice. ponytail: full workspace/provider
//     egress policy (externalDecisionProvidersAllowed) is deferred to the
//     enterprise-policy slice; scrubText covers the interim.
//   - productionTier now uses the provider resolver's own tier semantics
//     (fast|quality|reasoning) so over/under-provisioning is a real
//     comparison; the raw model ref is retained separately for diagnostics.
//   - Every event carries schema/provider/model/version stamps so historic
//     agreement curves can never silently mix experiments.

import { logEvent } from '@/lib/telemetry';
import { env } from '@/lib/env';
import { scrubText } from '@/lib/security/pii';
import type { UcolRoutingDecision } from '@/lib/ucol/routing/types';
import { jevEvaluate } from './provider';
import type { Questions } from './provider';

// Experimental-dataset version stamps. Bump on ANY change to question
// wording, tier mapping, or comparison logic — these fields make the
// telemetry joinable to the exact experiment that produced it.
export const DECISION_PLANE_SCHEMA_VERSION = 1;
export const QUESTION_SET_VERSION = 1;
export const TIER_POLICY_VERSION = 1;
export const DECISION_PROVIDER_ID = 'jev';

// Bandit action space (lib/ucol/routing/decision.ts) — Jev classifies into the
// SAME labels so agreement is directly measurable.
const TASK_CLASSES = {
  general_chat: 'Casual conversation, greetings, chit-chat, simple questions answerable from general knowledge',
  coding_task: 'Writing, modifying, debugging, or explaining code; building apps or features; technical implementation work',
  research_task: 'Multi-source research, comparison, analysis, architecture evaluation, strategy, planning',
  knowledge_query: 'A specific factual question the user expects answered from stored knowledge, documents, or memory',
  agentic_task: 'Multi-step work the user expects to be carried out autonomously with tools (browsing, file ops, executing workflows)',
} as const;

// Model tiers derived in CODE from Jev's semantic outputs (never asked of Jev).
// Uses the provider resolver's own tier vocabulary (fast|quality|reasoning) so
// the comparison against the production tier is apples-to-apples.
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
 * Production tier in the resolver's own semantics, derived from the agent
 * mode the request actually executed under (the mode that drove
 * resolveProviderForMode). Comparable with tierFromSemantics() output.
 */
function productionTierFromPlan(agentMode: string, personaOverride?: boolean): string {
  // Mirrors getModeTierRank + TIER_RANK semantics from providerResolver.
  switch (agentMode) {
    case 'reasoning':
    case 'agentic':
      return 'reasoning';
    case 'quality':
      return 'quality';
    default:
      return 'fast';
  }
  // ponytail: personaOverride can raise the effective tier; the resolver's
  // reason string carries it. Derived mode is the honest proxy until the
  // decision object exposes the resolved tier directly.
}

/**
 * Shadow evaluation — async so the call site can register the WHOLE operation
 * (JEV request + validation + telemetry write) with waitUntil. Zero latency
 * on the user-visible path either way.
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

  const state = {
    user_request: redactedInput,
    conversation_length_so_far: args.messageHistoryCount,
    has_file_attachments: args.hasAttachments,
    workspace_backed: Boolean(args.productionDecision.resolvedWorkspaceId),
    user_selected_mode: args.agentMode,
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
    const result = await jevEvaluate(state, questions);
    if (!result) {
      logEvent({
        eventType: 'jev_shadow_decision',
        userId: args.request.userId,
        workspaceId: args.request.workspaceId,
        metadata: {
          requestId: args.request.requestId,
          status: 'unavailable', // timeout/error/validation-failed — the fallback-rate metric
          productionIntent: args.productionDecision.intent.category,
          decisionPlaneSchemaVersion: DECISION_PLANE_SCHEMA_VERSION,
          decisionProvider: DECISION_PROVIDER_ID,
          decisionModel: env.JEV_MODEL,
          questionSetVersion: QUESTION_SET_VERSION,
          tierPolicyVersion: TIER_POLICY_VERSION,
        },
      });
      return;
    }

    const taskClass = result.answers.task_class as any;
    const jevIntent = (taskClass?.choice ?? 'unknown') as string;
    const agreement = jevIntent === args.productionDecision.intent.category;
    const jevTier = tierFromSemantics(result.answers);
    const productionTier = productionTierFromPlan(args.agentMode);

    logEvent({
      eventType: 'jev_shadow_decision',
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      metadata: {
        requestId: args.request.requestId,
        status: 'ok',
        // Experiment stamps — historic curves stay comparable.
        decisionPlaneSchemaVersion: DECISION_PLANE_SCHEMA_VERSION,
        decisionProvider: DECISION_PROVIDER_ID,
        decisionModel: result.model,
        questionSetVersion: QUESTION_SET_VERSION,
        tierPolicyVersion: TIER_POLICY_VERSION,
        // Agreement-rate metric
        productionIntent: args.productionDecision.intent.category,
        jevIntent,
        agreement,
        jevConfidence: taskClass?.confidence ?? null,
        // Over/under-provisioning — comparable tiers on both sides now.
        jevTier,
        productionTier,
        productionModelRef: args.productionDecision.providerPlan?.preferredModelRefs?.[0] ?? null,
        complexityScore: (result.answers.task_complexity as any)?.score ?? null,
        requiresToolsNoul: (result.answers.requires_tools as any)?.noul ?? null,
        requiresLongContextNoul: (result.answers.requires_long_context as any)?.noul ?? null,
        requiresStrongReasoningNoul: (result.answers.requires_strong_reasoning as any)?.noul ?? null,
        // Cost/latency — whole-operation numbers.
        jevLatencyMs: result.latencyMs,
        jevAttemptCount: result.attemptCount,
        jevInputTokens: result.usage.inputTokens,
      },
    });
  })().catch(() => { /* telemetry must never throw */ });
}
