// lib/ucol/observability/langfuse.ts
// UCOL-facing Langfuse adapter.
// Bridges existing lib/observability/langfuse.ts into the UcolSpan contract
// so the rest of UCOL never imports Langfuse types directly.

import { getLangfuseClient, createTrace } from '@/lib/observability/langfuse';

export interface CreateSpanParams {
  traceId: string;
  spanId: string;
  name: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  parentSpanId?: string;
}

export interface EndSpanParams {
  output?: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface LangfuseTraceContext {
  event: (params: { name: string; metadata?: Record<string, unknown> }) => void;
  update: (params: { metadata?: Record<string, unknown>; level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'; statusMessage?: string }) => void;
  end: (params: EndSpanParams) => void;
}

class LangfuseAdapter {
  public createSpan(params: CreateSpanParams): LangfuseTraceContext | null {
    try {
      const client = getLangfuseClient();
      const trace = client.trace({
        id: params.traceId,
        name: params.name,
        userId: params.userId,
        sessionId: params.sessionId,
        metadata: params.metadata,
      });

      const span = trace.span({
        id: params.spanId,
        name: params.name,
        ...(params.parentSpanId ? { metadata: { parentSpanId: params.parentSpanId } } : {}),
      });

      return {
        event: ({ name, metadata }) => {
          try { span.event({ name, metadata }); } catch { /* best-effort */ }
        },
        update: (updateParams) => {
          try {
            if (updateParams.metadata) trace.update({ metadata: updateParams.metadata });
            if (updateParams.level || updateParams.statusMessage) {
              span.update({ level: updateParams.level, statusMessage: updateParams.statusMessage });
            }
          } catch { /* best-effort */ }
        },
        end: (endParams) => {
          try {
            const update: Record<string, unknown> = {
              output: endParams.output,
              metadata: endParams.metadata,
            };
            if (endParams.level) update.level = endParams.level;
            if (endParams.statusMessage) update.statusMessage = endParams.statusMessage;
            span.end(endParams);
            trace.update(update);
          } catch { /* best-effort */ }
        },
      };
    } catch (error) {
      // Fail open: observability must never break core execution.
      console.error('[UCOL Observability] Langfuse adapter initialization failed:', error);
      return null;
    }
  }
}

export const langfuseAdapter = new LangfuseAdapter();
