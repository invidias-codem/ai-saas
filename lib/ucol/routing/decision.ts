import type { AgentMode } from '@/lib/llm/types';
import type { RuntimeProfileSignals } from '@/lib/workspaces/runtimeMode';
import { resolveProviderForMode } from './providerResolver';
import type {
  UcolRequestPacket,
  UcolResolvedContext,
  UcolRoutingDecision,
} from './types';

export type InitialRoutingSignals = {
  hasAttachments: boolean;
  messageHistoryCount: number;
  profile?: RuntimeProfileSignals | null;
};

// Features: [Length, HasAttachments, WorkspaceBacked, DeepRetrieval, CodeKeywords, ResearchKeywords, Frustration, ExplicitAgentic, ExplicitReasoning]
type ContextVector = [number, number, number, number, number, number, number, number, number];

// These weights are normally fetched/cached from the database (updated by the Background Optimizer).
// For now, they serve as the baseline contextual bandit weights.
const BANDIT_WEIGHTS: Record<string, ContextVector> = {
  'agentic_task':    [0.2, 0.1, 0.8, 0.4, 0.3, 0.1, 0.0, 5.0, 0.0],
  'research_task':   [0.5, 0.4, 0.5, 0.9, 0.0, 0.9, 0.1, 0.0, 5.0],
  'coding_task':     [0.4, 0.3, 0.6, 0.2, 0.9, 0.1, 0.5, 0.0, 0.0],
  'knowledge_query': [0.1, 0.9, 0.7, 0.3, 0.0, 0.2, 0.0, 0.0, 0.0],
  'general_chat':    [0.1, 0.0, 0.2, 0.0, 0.0, 0.0, -0.5, 0.0, 0.0], // Heavily penalize generic chat on frustration to avoid toxic loops
};

function computeContextVector(args: {
  request: UcolRequestPacket;
  context: UcolResolvedContext;
  agentMode: AgentMode;
  signals: InitialRoutingSignals;
}): ContextVector {
  const rawInput = args.request.rawInput.toLowerCase();
  return [
    rawInput.length > 200 ? 1 : 0,
    args.signals.hasAttachments ? 1 : 0,
    args.context.workspaceBacked ? 1 : 0,
    args.signals.profile?.retrieval_depth === 'deep' ? 1 : 0,
    /(build|implement|fix|refactor|debug|patch|code)/i.test(rawInput) ? 1 : 0,
    /(research|compare|analyze|architecture|strategy|plan)/i.test(rawInput) ? 1 : 0,
    /(wrong|fail|error|suck|stupid|again|not working|bad)/i.test(rawInput) ? 1 : 0, // Frustration signal
    args.agentMode === 'agentic' ? 1 : 0,
    args.agentMode === 'reasoning' ? 1 : 0,
  ];
}

function selectActionBandit(stateVector: ContextVector): { action: string, predictedReward: number } {
  let bestAction = 'general_chat';
  let maxReward = -Infinity;

  for (const [action, weights] of Object.entries(BANDIT_WEIGHTS)) {
    // Dot product of State Vector and Action Weights
    const reward = stateVector.reduce((sum, val, idx) => sum + val * weights[idx], 0);
    
    if (reward > maxReward) {
      maxReward = reward;
      bestAction = action;
    }
  }

  // Baseline minimum confidence for routing
  return { action: bestAction, predictedReward: Math.max(0.5, Math.min(0.99, maxReward / 5.0)) };
}

function inferIntent(args: {
  request: UcolRequestPacket;
  context: UcolResolvedContext;
  agentMode: AgentMode;
  signals: InitialRoutingSignals;
}): UcolRoutingDecision['intent'] {
  const stateVector = computeContextVector(args);
  const { action, predictedReward } = selectActionBandit(stateVector);

  let subtypes = [args.context.workspaceBacked ? 'workspace_backed' : 'general'];
  if (args.agentMode !== 'quality' && args.agentMode !== 'fast') {
    subtypes.push(args.agentMode);
  }
  if (args.signals.hasAttachments) subtypes.push('attachment_present');

  return {
    category: action as any,
    confidence: Number(predictedReward.toFixed(2)),
    subtypes,
    urgency: stateVector[6] === 1 ? 'high' : 'normal', // Frustration triggers high urgency routing
  };
}

function buildCapabilityRequirements(intent: UcolRoutingDecision['intent']['category'], context: UcolResolvedContext, signals: InitialRoutingSignals): string[] {
  const base = context.workspaceBacked ? ['memory.summarization'] : [];

  switch (intent) {
    case 'agentic_task':
      return ['workflow.agentic', 'tool.use.structured', ...base];
    case 'research_task':
      return ['chat.deep_reasoning', 'retrieval.query_rewrite', 'retrieval.graph_support', ...base];
    case 'coding_task':
      return ['coding.implementation', 'chat.general', ...base];
    case 'knowledge_query':
      return [signals.hasAttachments ? 'vision.document_parsing' : 'chat.general', ...base];
    default:
      return ['chat.general', ...base];
  }
}

function buildMemoryPlan(args: {
  context: UcolResolvedContext;
  agentMode: AgentMode;
  signals: InitialRoutingSignals;
}): UcolRoutingDecision['memoryPlan'] {
  const { context, agentMode, signals } = args;
  const readScopes = [...context.allowedMemoryScopes];
  const retrievalMode = signals.profile?.retrieval_depth === 'deep'
    ? 'deep'
    : agentMode === 'agentic' || agentMode === 'reasoning'
      ? 'deep'
      : context.workspaceBacked
        ? 'standard'
        : signals.hasAttachments
          ? 'standard'
          : 'light';

  const useGraphRecall = context.workspaceBacked || agentMode === 'reasoning' || signals.profile?.retrieval_depth === 'deep';
  const useRecentTaskState = context.allowedMemoryScopes.includes('task');

  const notes = [
    context.workspaceBacked ? 'workspace-backed conversation' : 'general/pre-workspace conversation',
    `agent mode resolved server-side: ${agentMode}`,
  ];

  if (signals.profile?.retrieval_depth) {
    notes.push(`profile retrieval depth: ${signals.profile.retrieval_depth}`);
  }

  if (signals.hasAttachments) {
    notes.push('attachment present; prefer stronger contextual grounding');
  }

  return {
    readScopes,
    retrievalMode,
    usePreparedContext: true,
    useGraphRecall,
    useRecentTaskState,
    notes,
  };
}

function buildRationale(args: {
  context: UcolResolvedContext;
  agentMode: AgentMode;
  intent: UcolRoutingDecision['intent'];
  signals: InitialRoutingSignals;
  providerReason: string;
}): string[] {
  const { context, agentMode, intent, signals, providerReason } = args;
  const rationale = [
    'initial routing decision built from chat route context',
    `intent inferred as ${intent.category}`,
    `agent mode resolved server-side: ${agentMode}`,
    providerReason,
  ];

  if (context.workspaceBacked) rationale.push('workspace-backed conversation influenced memory scope');
  if (context.operatingProfileResolved) rationale.push('operating profile resolved successfully');
  if (signals.profile?.retrieval_depth === 'deep') rationale.push('deep retrieval implied by operating profile');
  if (signals.hasAttachments) rationale.push('file attachment present');
  if (signals.messageHistoryCount > 0) rationale.push('prior message history supplied by client');

  return rationale;
}

export function buildInitialRoutingDecision(args: {
  request: UcolRequestPacket;
  context: UcolResolvedContext;
  agentMode: AgentMode;
  signals?: InitialRoutingSignals;
}): UcolRoutingDecision {
  const { request, context, agentMode } = args;
  const signals: InitialRoutingSignals = args.signals ?? {
    hasAttachments: Boolean(request.attachments?.length),
    messageHistoryCount: 0,
    profile: null,
  };
  const intent = inferIntent({ request, context, agentMode, signals });
  const isAgentic = agentMode === 'agentic';
  const providerResolution = resolveProviderForMode({ mode: agentMode, hasAttachments: signals.hasAttachments });

  return {
    requestId: request.requestId,
    operatingProfileId: context.operatingProfileId,
    resolvedWorkspaceId: context.workspaceId,
    intent,
    capabilityRequirements: buildCapabilityRequirements(intent.category, context, signals),
    memoryPlan: buildMemoryPlan({ context, agentMode, signals }),
    executionPlan: {
      mode: isAgentic ? 'agent_run' : context.workspaceBacked || intent.category === 'research_task' || intent.category === 'coding_task' || signals.hasAttachments ? 'retrieve_then_respond' : 'respond',
      syncOrAsync: 'sync',
      requiresUserConfirmation: false,
      createArtifact: false,
      createTaskRecord: false,
    },
    providerPlan: providerResolution.routing,
    toolPlan: {
      allowed: isAgentic,
      candidateTools: isAgentic ? ['agent_registry'] : [],
      restrictedByPolicy: [],
    },
    writebackPlan: {
      memoryWrites: [
        { scope: 'conversation', kind: 'summary', required: false },
        { scope: 'conversation', kind: 'fact', required: false },
        ...(context.workspaceBacked ? [{ scope: 'workspace' as const, kind: 'observation' as const, required: false }] : []),
      ],
      taskUpdate: 'none',
      telemetryRequired: true,
    },
    debug: {
      rationale: buildRationale({ context, agentMode, intent, signals, providerReason: providerResolution.reason }),
      policyFlags: context.notes || [],
    },
  };
}
