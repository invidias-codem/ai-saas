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
export const QUESTION_SET_VERSION = 2;
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

// Intents that plausibly involve tool use — derived deterministically from the
// production intent category, feeding state.has_tool_candidates.
const TOOL_INTENTS = new Set(['agentic_task', 'coding_task', 'research_task', 'knowledge_query']);

// v2 semantic choices (slice 2). Options named exactly per spec; the engine
// proposes, a later policy kernel composes — NOTHING here maps a judgment to
// a route/model/provider.
export const CAPABILITY_CHOICES = {
  fast: 'A small, fast model can answer this well',
  quality: 'This needs a higher-quality general model',
  reasoning: 'This needs strong deliberate reasoning',
} as const;
export const EFFORT_CHOICES = {
  low: 'Minimal reasoning effort suffices',
  medium: 'Moderate reasoning effort',
  high: 'Substantial reasoning effort',
  max: 'Maximum available reasoning effort',
} as const;
export const LEASE_CHOICES = {
  one_call: 'One model call can satisfy this request',
  tool_chain: 'This request requires a chain of tool calls',
  user_turn: 'This spans a full interactive user turn',
} as const;

function inferContextSizeBand(messageHistoryCount: number): string {
  if (messageHistoryCount < 5) return 'small';
  if (messageHistoryCount < 20) return 'medium';
  return 'large';
}

// Model tiers: jevTier = the engine's capability_requirement choice (already
// the resolver's fast|quality|reasoning vocabulary). Production tier is
// derived in CODE from the RESOLVED provider plan below.
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
      // Semantic context for interpretation only — NOT policy authority.
      // Deterministic authority facts (deterministicRisk, approvalRequired,
      // destructiveOperation, externalSideEffect) belong in policyContext,
      // never here.
      has_tool_candidates: TOOL_INTENTS.has(args.productionDecision.intent.category),
      estimated_context_size_band: inferContextSizeBand(args.messageHistoryCount),
      continuation_kind: args.messageHistoryCount > 0 ? 'continuation' : 'new_turn',
    },
    candidates: [],
    policyContext: {},
    requestId: args.request.requestId,
  };

  // v2 question set: independent semantic decisions, one batched call.
  // task_class retained for generation-0 calibration continuity.
  const questions: Questions = {
    task_class: {
      type: 'choice',
      instructions: 'Which category of work is this user request?',
      criteria: { ...TASK_CLASSES },
    },
    capability_requirement: {
      type: 'choice',
      instructions: 'What level of model capability does this request require?',
      criteria: { ...CAPABILITY_CHOICES },
    },
    reasoning_effort: {
      type: 'choice',
      instructions: 'How much reasoning effort does this request need?',
      criteria: { ...EFFORT_CHOICES },
    },
    risk_signal: {
      type: 'noul',
      // Semantic signal only. MUST NOT override policyContext.deterministicRisk.
      instructions: 'How risky does this request semantically appear (likelihood it involves sensitive, destructive, or irreversible operations)?',
    },
    route_lease: {
      type: 'choice',
      instructions: 'What is the smallest execution lease this request plausibly needs?',
      criteria: { ...LEASE_CHOICES },
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
    const capability = outcome.answers.capability_requirement as any;
    const effort = outcome.answers.reasoning_effort as any;
    const risk = outcome.answers.risk_signal as any;
    const lease = outcome.answers.route_lease as any;
    // ponytail: v2 proposals are the tier vocabulary; jevTier=v2 capability.
    const jevTier = (capability?.choice ?? 'fast') as string;
    const productionTier = productionTierFromPlan(args.productionDecision.providerPlan, args.agentMode);
    const proposedLease = lease?.choice as string | undefined;

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
        // v2 additive fields — per-judgment confidences, never a root one.
        proposedCapability: capability?.choice ?? null,
        capabilityConfidence: capability?.confidence ?? null,
        proposedEffort: effort?.choice ?? null,
        effortConfidence: effort?.confidence ?? null,
        riskSignal: risk?.noul ?? null,
        riskSignalConfidence: risk?.noul ?? null,
        proposedLease: proposedLease ?? null,
        leaseConfidence: lease?.confidence ?? null,
        jevLatencyMs: outcome.latencyMs,
        jevAttemptCount: outcome.attemptCount,
        jevInputTokens: outcome.usage.inputTokens,
        policyAction: policyOutcome.action,
        policyReasonCode: policyOutcome.reasonCode,
      },
    });

    // Normalized Decision Plane event, emitted IN PARALLEL (migration
    // overlap — jev_shadow_decision remains the calibration stream).
    logEvent({
      eventType: 'decision_event',
      userId: args.request.userId,
      workspaceId: args.request.workspaceId,
      metadata: {
        planeSchemaVersion: DECISION_PLANE_SCHEMA_VERSION,
        consumer: dossier.consumer,
        engineId: engine.id,
        engineModel: outcome.model,
        policyId: policy.id,
        policyVersion: policy.version,
        questionSetVersion: QUESTION_SET_VERSION,
        requestId: args.request.requestId,
        outcome,
        policyOutcome,
        proposedLease: proposedLease ?? null,
      },
    });
  })().catch(() => { /* telemetry must never throw */ });
}
