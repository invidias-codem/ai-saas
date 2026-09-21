// lib/intelligence/decision/shadowRouter.ts
// SHADOW-ONLY Jev evaluation of UCOL routing decisions. Slice 1 of the
// decision-plane rollout: zero production behavior change.
//
// For every real UCOL request we run the SAME batched semantic classification
// through Jev in parallel with the existing bandit + provider policy, then
// log agreement/disagreement. Jev never influences routing here — this
// module's output goes to telemetry only.
//
// Question design follows TypeSafe guidance: ONE batched request (fan-out),
// atomic questions, semantics only — Jev never sees provider names or the
// model catalog (indirection is a documented Jev 1.13 weakness). Deterministic
// code maps its answers to the bandit's own action space for comparison.

import { logEvent } from '@/lib/telemetry';
import { env } from '@/lib/env';
import type { UcolRoutingDecision } from '@/lib/ucol/routing/types';
import { jevEvaluate } from './provider';
import type { Questions } from './provider';

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
// Maps onto the providerResolver's mode semantics; recorded for the
// over/under-provisioning metric.
function tierFromSemantics(answers: Record<string, any>): string {
  const complexity = answers.task_complexity as any; // score answer
  const reasoning = (answers.requires_strong_reasoning as any)?.noul ?? 0;
  // score: 0=trivial 1=standard 2=complex 3=deep
  const level = complexity?.score ?? 1;
  if (level >= 2.5 || reasoning > 0.7) return 'strong';
  if (level >= 1.5) return 'standard';
  return 'fast';
}

/**
 * Shadow evaluation — fire-and-forget, never awaited on the request path.
 * Reads the ALREADY-MADE production decision (bandit output) and asks Jev
 * the same question independently, then logs the comparison.
 */
export function shadowEvaluateRouting(args: {
  request: { requestId: string; rawInput: string; userId?: string; workspaceId?: string };
  productionDecision: UcolRoutingDecision;
  agentMode: string;
  hasAttachments: boolean;
  messageHistoryCount: number;
}): void {
  // No key → no shadow (the plane is inert in dev/test).
  if (!env.TYPESAFE_API_KEY) return;

  const state = {
    user_request: args.request.rawInput.slice(0, 4_000),
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

  void (async () => {
    const result = await jevEvaluate(state, questions);
    if (!result) {
      logEvent({
        eventType: 'jev_shadow_decision',
        userId: args.request.userId,
        workspaceId: args.request.workspaceId,
        metadata: {
          requestId: args.request.requestId,
          status: 'unavailable', // timeout/error/no key path — the fallback rate metric
          productionIntent: args.productionDecision.intent.category,
        },
      });
      return;
    }

    const taskClass = result.answers.task_class as any;
    const jevIntent = (taskClass?.choice ?? 'unknown') as string;
    const agreement = jevIntent === args.productionDecision.intent.category;

    logEvent({
      eventType: 'jev_shadow_decision',
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      metadata: {
        requestId: args.request.requestId,
        status: 'ok',
        // Agreement-rate metric
        productionIntent: args.productionDecision.intent.category,
        jevIntent,
        agreement,
        jevConfidence: taskClass?.confidence ?? null,
        // Over/under-provisioning metric
        jevTier: tierFromSemantics(result.answers),
        productionTier: args.productionDecision.providerPlan?.preferredModelRefs?.[0] ?? null,
        complexityScore: (result.answers.task_complexity as any)?.score ?? null,
        requiresToolsNoul: (result.answers.requires_tools as any)?.noul ?? null,
        requiresLongContextNoul: (result.answers.requires_long_context as any)?.noul ?? null,
        requiresStrongReasoningNoul: (result.answers.requires_strong_reasoning as any)?.noul ?? null,
        // Cost/latency metric
        jevLatencyMs: result.latencyMs,
        jevInputTokens: result.usage.inputTokens,
        jevModel: result.model,
      },
    });
  })().catch(() => { /* telemetry must never throw */ });
}
