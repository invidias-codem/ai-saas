export type UcolSurface = 'web' | 'android' | 'api' | 'background-agent' | 'extension';

export type UcolAttachmentType = 'image' | 'audio' | 'video' | 'document' | 'link' | 'structured';

export type UcolTrustSource = 'direct_user' | 'system_generated' | 'imported' | 'unknown';

export type UcolPlatform = 'web' | 'android' | 'ios' | 'desktop';

export type UcolIntentCategory =
  | 'general_chat'
  | 'knowledge_query'
  | 'coding_task'
  | 'research_task'
  | 'workflow_task'
  | 'memory_update'
  | 'agentic_task'
  | 'social_drafting'
  | 'device_action'
  | 'other';

export type UcolMemoryScope = 'session' | 'conversation' | 'workspace' | 'user' | 'device' | 'graph' | 'task';

export type UcolRetrievalMode = 'none' | 'light' | 'standard' | 'deep';

export type UcolExecutionMode =
  | 'respond'
  | 'retrieve_then_respond'
  | 'tool_run'
  | 'durable_task'
  | 'agent_run'
  | 'clarify_first'
  | 'refuse_or_safe_complete';

export type UcolSyncMode = 'sync' | 'async';

export type UcolSelectionStrategy = 'single_model' | 'primary_plus_fallback' | 'multi_step_chain' | 'local_then_cloud';

export type UcolWritebackKind =
  | 'summary'
  | 'fact'
  | 'claim'
  | 'artifact_link'
  | 'task_state'
  | 'preference'
  | 'observation';

export type UcolTaskUpdateMode = 'none' | 'create' | 'append' | 'close';

export type UcolOutcome = 'success' | 'partial' | 'failed' | 'clarified' | 'refused';

export interface UcolRequestAttachment {
  id: string;
  type: UcolAttachmentType;
  mimeType?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface UcolClientHints {
  locale?: string;
  timezone?: string;
  uiEntryPoint?: string;
  preferredLatency?: 'low' | 'balanced' | 'high';
  preferredCost?: 'low' | 'balanced' | 'high';
}

export interface UcolDeviceContext {
  deviceId?: string;
  platform?: UcolPlatform;
  localCapabilities?: string[];
  online?: boolean;
  batteryState?: 'normal' | 'low_power';
  networkClass?: 'offline' | 'metered' | 'unmetered' | 'unknown';
}

export interface UcolTrustContext {
  canUseExternalActions: boolean;
  canUseSensitiveTools: boolean;
  requestSourceTrust: UcolTrustSource;
}

export interface UcolRequestPacket {
  requestId: string;
  userId: string;
  workspaceId?: string;
  conversationId?: string;
  surface: UcolSurface;
  rawInput: string;
  attachments?: UcolRequestAttachment[];
  clientHints?: UcolClientHints;
  deviceContext?: UcolDeviceContext;
  trustContext?: UcolTrustContext;
  createdAt: string;
}

export interface UcolResolvedContext {
  workspaceId?: string;
  operatingProfileId?: string;
  conversationId?: string;
  surface: UcolSurface;
  preWorkspace: boolean;
  workspaceBacked: boolean;
  operatingProfileResolved: boolean;
  allowedMemoryScopes: UcolMemoryScope[];
  notes?: string[];
}

export interface UcolIntent {
  category: UcolIntentCategory;
  confidence: number;
  subtypes?: string[];
  urgency?: 'low' | 'normal' | 'high';
}

export interface UcolMemoryPlan {
  readScopes: UcolMemoryScope[];
  retrievalMode: UcolRetrievalMode;
  usePreparedContext: boolean;
  useGraphRecall: boolean;
  useRecentTaskState: boolean;
  notes?: string[];
}

export interface UcolExecutionPlan {
  mode: UcolExecutionMode;
  syncOrAsync: UcolSyncMode;
  requiresUserConfirmation: boolean;
  createArtifact: boolean;
  createTaskRecord: boolean;
}

export interface UcolProviderPlan {
  selectionStrategy: UcolSelectionStrategy;
  preferredModelRefs: string[];
  fallbackModelRefs?: string[];
  embeddingLanePreference?: string[];
}

export interface UcolToolPlan {
  allowed: boolean;
  candidateTools: string[];
  restrictedByPolicy?: string[];
}

export interface UcolWritebackItem {
  scope: Extract<UcolMemoryScope, 'conversation' | 'workspace' | 'user' | 'device' | 'task'>;
  kind: UcolWritebackKind;
  required: boolean;
}

export interface UcolWritebackPlan {
  memoryWrites: UcolWritebackItem[];
  taskUpdate?: UcolTaskUpdateMode;
  telemetryRequired: boolean;
}

export interface UcolRoutingDebug {
  rationale: string[];
  downgradedFrom?: string;
  policyFlags?: string[];
}

export interface UcolRoutingDecision {
  requestId: string;
  operatingProfileId?: string;
  resolvedWorkspaceId?: string;
  intent: UcolIntent;
  capabilityRequirements: string[];
  memoryPlan: UcolMemoryPlan;
  executionPlan: UcolExecutionPlan;
  providerPlan: UcolProviderPlan;
  toolPlan: UcolToolPlan;
  writebackPlan: UcolWritebackPlan;
  debug: UcolRoutingDebug;
}

export interface UcolRoutingTelemetry {
  requestId: string;
  routeTimestamp: string;
  intentCategory: UcolIntentCategory;
  workspaceId?: string;
  operatingProfileId?: string;
  executionMode: UcolExecutionMode;
  selectedModelRefs: string[];
  selectedTools: string[];
  readScopes: UcolMemoryScope[];
  memoryHits?: number;
  graphHits?: number;
  latencyMs?: number;
  estimatedCostUsd?: number;
  outcome: UcolOutcome;
  userCorrectionSignal?: 'none' | 'implicit' | 'explicit';
  notes?: string[];
}
