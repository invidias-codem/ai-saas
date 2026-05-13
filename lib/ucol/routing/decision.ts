import type { AgentMode } from '@/lib/llm/types';
import type {
  UcolRequestPacket,
  UcolResolvedContext,
  UcolRoutingDecision,
} from './types';

function intentFromAgentMode(mode: AgentMode): UcolRoutingDecision['intent'] {
  if (mode === 'agentic') {
    return {
      category: 'agentic_task',
      confidence: 0.7,
      subtypes: ['tool_orchestrated'],
      urgency: 'normal',
    };
  }

  if (mode === 'reasoning') {
    return {
      category: 'research_task',
      confidence: 0.6,
      subtypes: ['deep_reasoning'],
      urgency: 'normal',
    };
  }

  return {
    category: 'general_chat',
    confidence: 0.55,
    subtypes: [mode],
    urgency: 'normal',
  };
}

function providerPlanFromAgentMode(mode: AgentMode): UcolRoutingDecision['providerPlan'] {
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
      fallbackModelRefs: ['gemini.fast_fallback'],
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

export function buildInitialRoutingDecision(args: {
  request: UcolRequestPacket;
  context: UcolResolvedContext;
  agentMode: AgentMode;
}): UcolRoutingDecision {
  const { request, context, agentMode } = args;
  const workspaceBacked = context.workspaceBacked;
  const isAgentic = agentMode === 'agentic';
  const isReasoning = agentMode === 'reasoning';

  return {
    requestId: request.requestId,
    operatingProfileId: context.operatingProfileId,
    resolvedWorkspaceId: context.workspaceId,
    intent: intentFromAgentMode(agentMode),
    capabilityRequirements: isAgentic
      ? ['workflow.agentic', 'tool.use.structured']
      : isReasoning
        ? ['chat.deep_reasoning', 'retrieval.query_rewrite']
        : workspaceBacked
          ? ['chat.general', 'memory.summarization']
          : ['chat.general'],
    memoryPlan: {
      readScopes: workspaceBacked
        ? ['conversation', 'workspace', 'user']
        : ['conversation', 'user'],
      retrievalMode: isAgentic || isReasoning ? 'deep' : workspaceBacked ? 'standard' : 'light',
      usePreparedContext: true,
      useGraphRecall: workspaceBacked || isReasoning,
      useRecentTaskState: false,
      notes: [
        workspaceBacked ? 'workspace-backed conversation' : 'general/pre-workspace conversation',
        `agent mode resolved server-side: ${agentMode}`,
      ],
    },
    executionPlan: {
      mode: isAgentic ? 'agent_run' : workspaceBacked || isReasoning ? 'retrieve_then_respond' : 'respond',
      syncOrAsync: 'sync',
      requiresUserConfirmation: false,
      createArtifact: false,
      createTaskRecord: false,
    },
    providerPlan: providerPlanFromAgentMode(agentMode),
    toolPlan: {
      allowed: isAgentic,
      candidateTools: isAgentic ? ['agent_registry'] : [],
      restrictedByPolicy: [],
    },
    writebackPlan: {
      memoryWrites: [
        { scope: 'conversation', kind: 'summary', required: false },
        { scope: 'conversation', kind: 'fact', required: false },
      ],
      taskUpdate: 'none',
      telemetryRequired: true,
    },
    debug: {
      rationale: [
        'initial scaffold decision built from chat route context',
        'execution and provider plans are currently inferred from resolved agent mode',
      ],
      policyFlags: context.notes || [],
    },
  };
}
