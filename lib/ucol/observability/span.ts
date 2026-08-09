// lib/ucol/observability/span.ts
// UCOL unified span lifecycle.
// Single source of truth for a UCOL execution block: W3C trace context,
// Langfuse correlation, and UDIF ledger audit emission.

import { newTrace, newSpan, type TraceContext } from '@/lib/telemetry/trace';
import { emitInteractionAudit, type EmitInteractionAuditInput } from '@/lib/telemetry/emit';
import { deriveContextRole } from '@/lib/telemetry/governance';
import { langfuseAdapter, type CreateSpanParams, type EndSpanParams } from './langfuse';

export type SpanStatus = 'started' | 'completed' | 'error';

/** Standardized span attribute keys for UCOL execution traces. */
export const SPAN_ATTRS = {
  agentStepNumber: 'agent.step_number',
  modelId: 'model.id',
  providerId: 'provider.id',
  tokenCount: 'token.count',
  chunkLength: 'chunk.length',
  surface: 'surface',
  taskType: 'task.type',
  routingTier: 'routing.tier',
  requestedModel: 'model.requested',
} as const;

export interface UcolSpanOptions {
  name: string;
  traceId?: string;
  parentSpanId?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  surface?: string;
  tags?: string[];
  macroWorkflowId?: string;
}

export interface SpanOutput {
  output?: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number;
  responseLength?: number;
  responseVia?: string;
  metadata?: Record<string, unknown>;
}

export class UcolSpan {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly name: string;
  private readonly startTime: number;
  private readonly langfuseContext: ReturnType<typeof langfuseAdapter.createSpan> | null = null;
  private isEnded = false;
  private lastDurationMs = 0;

  constructor(options: UcolSpanOptions) {
    this.traceId = options.traceId || newTrace().trace_id;
    this.spanId = newTrace().span_id;
    this.name = options.name;
    this.startTime = Date.now();

    this.langfuseContext = langfuseAdapter.createSpan({
      traceId: this.traceId,
      spanId: this.spanId,
      name: this.name,
      userId: options.userId,
      sessionId: options.sessionId,
      metadata: options.metadata,
    });
  }

  public get durationMs(): number {
    return this.lastDurationMs;
  }

  public addEvent(name: string, data?: Record<string, unknown>): void {
    if (this.isEnded) return;
    this.langfuseContext?.event({ name, metadata: data });
  }

  public setAttribute(key: string, value: unknown): void {
    if (this.isEnded) return;
    this.langfuseContext?.update({ metadata: { [key]: value } });
  }

  public end(result?: SpanOutput): { traceId: string; durationMs: number } {
    if (this.isEnded) {
      return { traceId: this.traceId, durationMs: Date.now() - this.startTime };
    }

    const durationMs = Date.now() - this.startTime;
    this.isEnded = true;

    this.langfuseContext?.end({
      output: result?.output,
      usage: result?.usage,
      metadata: {
        ...result?.metadata,
        durationMs,
      },
    });

    return { traceId: this.traceId, durationMs };
  }

  public fail(error: Error | string, metadata?: Record<string, unknown>): void {
    if (this.isEnded) return;
    const durationMs = Date.now() - this.startTime;
    this.isEnded = true;

    this.langfuseContext?.end({
      level: 'ERROR',
      statusMessage: typeof error === 'string' ? error : error.message,
      metadata: {
        ...metadata,
        durationMs,
        errorStack: typeof error === 'string' ? undefined : error.stack,
      },
    });
  }

  public toAuditInput(extra: Partial<EmitInteractionAuditInput> = {}): EmitInteractionAuditInput {
    return {
      requestedModelId: extra.requestedModelId ?? '',
      actualModelId: extra.actualModelId ?? '',
      systemProvider: extra.systemProvider ?? 'unknown',
      agentName: extra.agentName ?? this.name,
      agentRole: extra.agentRole ?? this.name,
      creditCost: extra.creditCost ?? 0,
      contextRole: extra.contextRole,
      macroWorkflowId: extra.macroWorkflowId,
      traceContext: {
        trace_id: this.traceId,
        span_id: this.spanId,
        parent_span_id: null,
      },
    };
  }

  public startChild(options: UcolSpanOptions): UcolSpan {
    const childTrace = newSpan({ trace_id: this.traceId, span_id: this.spanId, parent_span_id: this.spanId });
    return new UcolSpan({
      ...options,
      traceId: childTrace.trace_id,
      parentSpanId: childTrace.parent_span_id ?? undefined,
    });
  }
}

export function startUcolSpan(input: UcolSpanOptions) {
  return new UcolSpan(input);
}
