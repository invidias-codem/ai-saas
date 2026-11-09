/**
 * Conversation Continuity C0 — pure durable state and delegation contracts.
 *
 * Code Builder's browser stream is NOT the task. A persistent run ID, worker,
 * event journal, checkpoint, and owner-scoped read path must survive the page.
 *
 * This is groundwork only; it does not make /api/chat durable by itself.
 */
export const CONVERSATION_RUN_STATUSES = [
  'queued', 'running', 'awaiting_approval', 'completed', 'failed', 'cancelled',
] as const;
export type ConversationRunStatus = (typeof CONVERSATION_RUN_STATUSES)[number];

export const GENERATION_ENGINES = [
  'conversation', 'code', 'research', 'image', 'video', 'audio', 'browser', 'data',
] as const;
export type GenerationEngine = (typeof GENERATION_ENGINES)[number];

export type RunEventKind =
  | 'queued' | 'started' | 'checkpoint' | 'delegated' | 'handoff'
  | 'awaiting_approval' | 'resumed' | 'completed' | 'failed' | 'cancelled';

export interface RunCursor {
  runId: string;
  status: ConversationRunStatus;
  phase: string;
  generation: number;
  sequence: number;
  resultRef: string | null;
}

export interface RunTransition {
  expectedGeneration: number;
  nextSequence: number;
  status: ConversationRunStatus;
  phase: string;
  resultRef?: string | null;
  /** Explicitly rotate authority after an approval/handoff. */
  nextGeneration?: number;
}

/** Return the new cursor or throw. No network, clock, or database access. */
export function transitionRun(current: RunCursor, update: RunTransition): RunCursor {
  if (!Number.isSafeInteger(current.generation) || current.generation < 0 ||
      !Number.isSafeInteger(current.sequence) || current.sequence < 0) {
    throw new Error('invalid_current_cursor');
  }
  if (update.expectedGeneration !== current.generation) throw new Error('stale_generation');
  if (!Number.isSafeInteger(update.nextSequence) ||
      update.nextSequence !== current.sequence + 1) throw new Error('event_sequence_conflict');
  if (['completed','failed','cancelled'].includes(current.status)) {
    throw new Error('terminal_run_immutable');
  }
  const legal: Record<ConversationRunStatus, ConversationRunStatus[]> = {
    queued: ['running','failed','cancelled'],
    running: ['running','awaiting_approval','completed','failed','cancelled'],
    awaiting_approval: ['running','failed','cancelled'],
    completed: [], failed: [], cancelled: [],
  };
  if (!legal[current.status].includes(update.status)) throw new Error('invalid_run_transition');
  if (!update.phase || update.phase.length > 80) throw new Error('invalid_phase');
  // A handoff or approval resume MUST fence any old agent/controller. Never
  // silently keep the prior authority generation when control changes.
  const handoff = update.status === 'awaiting_approval' ||
    current.status === 'awaiting_approval';
  if (handoff && update.nextGeneration !== current.generation + 1) {
    throw new Error('handoff_requires_generation_rotation');
  }
  if (!handoff && update.nextGeneration !== undefined &&
      update.nextGeneration !== current.generation) {
    throw new Error('invalid_generation_advance');
  }
  const resultRef = update.resultRef ?? current.resultRef;
  if (update.status === 'completed' && !resultRef) throw new Error('missing_durable_result');
  return {
    runId: current.runId,
    status: update.status,
    phase: update.phase,
    generation: handoff ? current.generation + 1 : current.generation,
    sequence: update.nextSequence,
    resultRef,
  };
}

export interface EngineDelegation {
  parentRunId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  engine: GenerationEngine;
  capabilities: string[];
  maximumCostCents: number;
  contextPacketRef: string;
  resultArtifactRef?: string;
}

/**
 * Admission gate for specialists in one coordinated workspace. Never trust
 * delegated model output as authorization or assign another workspace's data.
 * External mutations need a separately approved execution grant.
 */
export function validateDelegation(args: {
  parentRunId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  allowedEngines: readonly GenerationEngine[];
  allowedCapabilities: readonly string[];
  remainingBudgetCents: number;
  delegation: EngineDelegation;
}): void {
  const { delegation: d } = args;
  if (!d.parentRunId || d.parentRunId !== args.parentRunId ||
      !d.userId || d.userId !== args.userId ||
      !d.workspaceId || d.workspaceId !== args.workspaceId ||
      !d.conversationId || d.conversationId !== args.conversationId) {
    throw new Error('delegation_scope_mismatch');
  }
  if (!args.allowedEngines.includes(d.engine)) throw new Error('engine_not_authorized');
  if (!d.contextPacketRef) throw new Error('missing_context_packet');
  if (!Number.isSafeInteger(d.maximumCostCents) || d.maximumCostCents < 0 ||
      d.maximumCostCents > args.remainingBudgetCents) throw new Error('delegation_budget_exceeded');
  if (d.capabilities.some((c) => !args.allowedCapabilities.includes(c))) {
    throw new Error('delegation_capability_denied');
  }
}
