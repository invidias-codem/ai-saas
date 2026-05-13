import type { AgentMode } from '@/lib/llm/types';
import type { RuntimeProfileSignals } from '@/lib/workspaces/runtimeMode';
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

function inferIntent(args: {
  request: UcolRequestPacket;
  context: UcolResolvedContext;
  agentMode: AgentMode;
  signals: InitialRoutingSignals;
}): UcolRoutingDecision['intent'] {
  const { request, context, agentMode, signals } = args;
  const rawInput = request.rawInput.toLowerCase();

  if (agentMode === 'agentic') {
    return {
      category: 'agentic_task',
      confidence: 0.82,
      subtypes: ['tool_orchestrated', context.workspaceBacked ? 'workspace_backed' : 'general'],
      urgency: 'normal',
    };
  }

  if (agentMode === 'reasoning' || signals.profile?.retrieval_depth === 'deep') {
    return {
      category: 'research_task',
      confidence: 0.74,
      subtypes: ['deep_reasoning'],
      urgency: 'normal',
    };
  }

  if (signals.hasAttachments) {
    return {
      category: 'knowledge_query',
      confidence: 0.68,
      subtypes: ['attachment_present'],
      urgency: 'normal',
    };
  }

  if (/(build|implement|fix|refactor|debug|patch|code)/i.test(rawInput)) {
    return {
      category: 'coding_task',
      confidence: 0.66,
      subtypes: ['code_or_implementation'],
      urgency: 'normal',
    };
  }

  if (/(research|compare|analyze|architecture|strategy|plan)/i.test(rawInput)) {
    return {
      category: 'research_task',
      confidence: 0.61,
      subtypes: ['analysis_or_strategy'],
      urgency: 'normal',
    };
  }

  return {
    category: 'general_chat',
    confidence: context.workspaceBacked ? 0.58 : 0.55,
    subtypes: [agentMode, context.workspaceBacked ? 'workspace_backed' : 'general'],
    urgency: 'normal',
  };
}

function providerPlanFromAgentMode(mode: AgentMode, hasAttachments: boolean): UcolRoutingDecision['providerPlan'] {
  if (mode === 'agentic') {
    return {
      selectionStrategy: 'single_model',
      preferredModelRefs: ['claude.agentic'],
      fallbackModelRefs: ['gemini.quality'],
      embeddingLanePreference: ['primary_768', 'secondary_3072'],
    };
  }

  if (mode === 'reasoning') {
    return {
      selectionStrategy: 'single_model',
      preferredModelRefs: ['deepseek.reasoning'],
      fallbackModelRefs: ['gemini.quality'],
      embeddingLanePreference: ['primary_768', 'secondary_3072'],
    };
  }

  if (mode === 'fast') {
    return {
      selectionStrategy: 'primary_plus_fallback',
      preferredModelRefs: ['hermes.fast'],
      fallbackModelRefs: hasAttachments ? ['gemini.quality'] : ['gemini.fast_fallback'],
      embeddingLanePreference: ['primary_768', 'secondary_3072'],
    };
  }

  return {
    selectionStrategy: 'single_model',
    preferredModelRefs: ['gemini.quality'],
    fallbackModelRefs: ['claude.agentic'],
    embeddingLanePreference: ['primary_768', 'secondary_3072'],
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
}): string[] {
  const { context, agentMode, intent, signals } = args;
  const rationale = [
    'initial routing decision built from chat route context',
    `intent inferred as ${intent.category}`,
    `agent mode resolved server-side: ${agentMode}`,
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
    providerPlan: providerPlanFromAgentMode(agentMode, signals.hasAttachments),
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
      rationale: buildRationale({ context, agentMode, intent, signals }),
      policyFlags: context.notes || [],
    },
  };
}
