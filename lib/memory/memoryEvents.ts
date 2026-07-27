// lib/memory/memoryEvents.ts

import type { MemoryEvent, ToolInvocation, ModelDecision } from './memoryEventSchema';
import { MemoryEventSchema } from './memoryEventSchema';
import { logger } from '@/lib/logger';
import { estimateTokenCount } from '@/lib/ragMemory';

export function createDefaultMemoryEvent(partial: Partial<MemoryEvent>): MemoryEvent {
  return {
    source: 'genie',
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    costEstimate: null,
    confidence: null,
    ...partial,
  } as MemoryEvent;
}

export function createDefaultModelDecision(overrides: Partial<ModelDecision>): ModelDecision {
  return {
    requestedModel: overrides.requestedModel ?? 'unknown',
    routedModel: overrides.routedModel ?? 'unknown',
    routeReason: overrides.routeReason,
    fallbackUsed: overrides.fallbackUsed ?? false,
    provider: overrides.provider ?? 'unknown',
  };
}

export function buildConversationEventContext(args: {
  userId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  source?: MemoryEvent['source'];
  promptText?: string | null;
  resultSummary?: string | null;
  startTime?: number | null;
}): Pick<MemoryEvent, 'userId' | 'workspaceId' | 'sessionId' | 'source' | 'promptHash' | 'resultSummary' | 'latencyMs'> {
  const start = args.startTime ?? Date.now();
  const promptHash = hashPrompt(args.promptText ?? args.resultSummary ?? '');
  const summary = truncateResultSummary(args.resultSummary);

  return {
    userId: args.userId,
    workspaceId: args.workspaceId ?? undefined,
    sessionId: args.sessionId ?? undefined,
    source: args.source ?? 'genie',
    promptHash,
    resultSummary: summary,
    latencyMs: Math.max(0, Date.now() - start),
  };
}

function hashPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const normalized = trimmed.replace(/\s+/g, ' ').slice(0, 2000);
  const data = new TextEncoder().encode(normalized);

  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return crypto.subtle
        .digest('SHA-256', data)
        .then((buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join(''))
        .catch(() => simpleHash(normalized));
    }
  } catch {
    // noop: fall through to simple hash
  }

  return simpleHash(normalized);
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charCodeAt(index);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `sha1-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

function truncateResultSummary(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.length > 1000 ? `${normalized.slice(0, 997)}...` : normalized;
}

export function memoriesToToolInvocations(args: {
  toolName: string;
  toolId?: string;
  status?: ToolInvocation['status'];
  startedAt?: number | null;
  outputSummary?: string | null;
  extra?: Record<string, unknown>;
}): ToolInvocation {
  const startedAt = args.startedAt ?? Date.now();
  const normalizedOutput = typeof args.outputSummary === 'string' ? args.outputSummary.trim() : '';

  return {
    toolId: args.toolId ?? `tool-${args.toolName}-${startedAt}`,
    toolName: args.toolName,
    status: args.status ?? 'success',
    latencyMs: Math.max(0, Date.now() - startedAt),
    argsHash: args.extra && typeof args.extra === 'object' ? hashObject(args.extra) : 'unknown',
    outputSummary: normalizedOutput.length > 0 ? truncateResultSummary(normalizedOutput) : undefined,
  };
}

export function conversationModelDecision(overrides: { model?: string | null; provider?: string | null; fallbackUsed?: boolean }): ModelDecision {
  return {
    requestedModel: overrides.model ?? 'unknown',
    routedModel: overrides.model ?? 'unknown',
    routeReason: 'runtime model resolution',
    fallbackUsed: overrides.fallbackUsed ?? false,
    provider: overrides.provider ?? 'unknown',
  } satisfies ModelDecision;
}

export function emitConversationMemoryEvent(args: {
  userId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  source?: MemoryEvent['source'];
  promptText?: string | null;
  resultSummary?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costEstimate?: number | null;
  confidence?: number | null;
  model?: { modelId?: string | null; provider?: string | null; fallbackUsed?: boolean } | null;
  toolInvocations?: ToolInvocation[];
  startTime?: number | null;
}): void {
  const base = buildConversationEventContext({
    userId: args.userId,
    workspaceId: args.workspaceId,
    sessionId: args.sessionId,
    source: args.source,
    promptText: args.promptText,
    resultSummary: args.resultSummary,
    startTime: args.startTime,
  });

  const event = createDefaultMemoryEvent({
    ...base,
    tokensIn: args.tokensIn ?? 0,
    tokensOut: args.tokensOut ?? 0,
    costEstimate: args.costEstimate ?? null,
    confidence: args.confidence ?? null,
    toolInvocations: args.toolInvocations,
    modelDecision: args.model ? conversationModelDecision(args.model) : undefined,
  });

  const parsed = MemoryEventSchema.safeParse(event);
  const payload = parsed.success ? parsed.data : event;

  if (typeof fetch !== 'undefined') {
    void fetch('/api/memory/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch((error) => {
      logger.warn('[memoryEvents] Remote ingest failed', { error: error?.message ?? error });
    });
  }
}

export function readStreamForMemory(args: {
  stream: ReadableStream<Uint8Array>;
  userId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  source?: MemoryEvent['source'];
  promptText?: string | null;
  tokensIn?: number | null;
  model?: { modelId?: string | null; provider?: string | null; fallbackUsed?: boolean } | null;
  startTime?: number | null;
}) {
  let collected = '';
  const reader = args.stream.getReader();
  const decoder = new TextDecoder();

  async function pump(): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (typeof value === 'string') {
          collected += value;
        } else if (value) {
          collected += decoder.decode(value, { stream: true });
        }
      }
    } catch {
      // Best-effort metadata only; never break response delivery.
    }

    const cleaned = stripThoughtWrappers(collected);
    emitConversationMemoryEvent({
      userId: args.userId,
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      source: args.source,
      promptText: args.promptText,
      resultSummary: truncateResultSummary(cleaned),
      tokensIn: args.tokensIn,
      tokensOut: estimateTokenCount(cleaned),
      model: args.model,
      startTime: args.startTime,
    });
  }

  void pump();
}

function stripThoughtWrappers(text: string): string {
  return text.replace(/<thought>[\s\S]*?<\/thought>/g, '').replace(/<\/?thought>/g, '').trim();
}

function hashObject(record: Record<string, unknown>): string {
  const normalized = Object.entries(record)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('&');

  if (!normalized) {
    return 'empty';
  }

  return simpleHash(normalized);
}
