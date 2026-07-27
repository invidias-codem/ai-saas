// app/api/memory/events/route.ts

/** Append-only ingest for memory-observability events.
 *
 * Contracts:
 * - POST must be append-only: writes are never retried against existing records.
 * - Only authorized owners for the referenced workspace/user may write.
 * - PII defaults to omitted; includeRawPrompt/context toggles are opt-in only.
 */

import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { audit } from '@/lib/security/auditLog';
import { logger } from '@/lib/logger';
import { MemoryEventSchema } from '@/lib/memory/memoryEventSchema';
import { supabaseAdmin } from '@/lib/supabaseClient';

export const maxToolInvocations = 20;
export const maxMemoryEventBodyLength = 2000;
export const maxResultSummaryLength = 1000;

export type MemoryEventIngestError = {
  error: string;
  details?: unknown;
};

function sanitizeEventBody(body: unknown): unknown {
  if (typeof body !== 'string') {
    return body ?? null;
  }

  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxMemoryEventBodyLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxMemoryEventBodyLength - 3)}...`;
}

function truncateOutputSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed.slice(0, 500);
}

function sanitizeModelDecision(raw: unknown): { requestedModel: string; routedModel: string; routeReason?: string; fallbackUsed: boolean; provider: string } | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const source = raw as Record<string, unknown>;
  return {
    requestedModel: typeof source.requestedModel === 'string' ? source.requestedModel : 'unknown',
    routedModel: typeof source.routedModel === 'string' ? source.routedModel : 'unknown',
    routeReason: typeof source.routeReason === 'string' ? source.routeReason.slice(0, 500) : undefined,
    fallbackUsed: Boolean(source.fallbackUsed),
    provider: typeof source.provider === 'string' ? source.provider.slice(0, 200) : 'unknown',
  };
}

function normalizeToolInvocations(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.slice(0, maxToolInvocations).map((item) => {
    if (!item || typeof item !== 'object') {
      return {
        toolId: `tool-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        toolName: 'unknown-tool',
        status: 'skipped' as const,
        latencyMs: 0,
        argsHash: 'unknown',
      };
    }

    const invocation = item as Record<string, unknown>;
    return {
      toolId: typeof invocation.toolId === 'string' ? invocation.toolId : `tool-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      toolName: typeof invocation.toolName === 'string' ? invocation.toolName : 'unknown-tool',
      status: ['success', 'failure', 'skipped'].includes(invocation.status as string) ? (invocation.status as 'success' | 'failure' | 'skipped') : 'skipped',
      latencyMs: typeof invocation.latencyMs === 'number' && Number.isFinite(invocation.latencyMs) ? invocation.latencyMs : 0,
      argsHash: typeof invocation.argsHash === 'string' ? invocation.argsHash : 'unknown',
      outputSummary: truncateOutputSummary(invocation.outputSummary),
    };
  });
}

function persistEventLocally(event: Record<string, unknown>): void {
  try {
    if (!supabaseAdmin) {
      return;
    }

    void supabaseAdmin
      .from('memory_events')
      .insert(event)
      .then(({ error }) => {
        if (error) {
          console.warn('[memory/events] fallback local persistence failed', error);
        }
      });
  } catch (error) {
    console.warn('[memory/events] local persistence threw', error);
  }
}

async function respondMemoryEventError(req: Request, status: number, error: MemoryEventIngestError): Promise<NextResponse> {
  console.error('[memory/events] Ingest error', error);
  return NextResponse.json(
    { error: error.error, details: error.details ?? 'unknown error' },
    { status }
  );
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch (authError) {
    return handleAuthError(authError);
  }

  try {
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const rawBody = await req.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = MemoryEventSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const event: Record<string, unknown> = {
      ...payload,
      userId: user.userId,
      entityRefs: Array.isArray(payload.entityRefs) ? payload.entityRefs.slice(0, 100) : [],
      toolInvocations: normalizeToolInvocations(payload.toolInvocations),
      resultSummary: sanitizeEventBody(payload.resultSummary) as string,
    };

    const sanitizedModelDecision = sanitizeModelDecision(event.modelDecision);
    if (sanitizedModelDecision) {
      event.modelDecision = sanitizedModelDecision;
    }

    let supabaseError: unknown = null;

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('memory_events')
        .insert(event)
        .select('id')
        .single();

      supabaseError = error;

      if (error) {
        console.error('[memory/events] Supabase insert failed', error);
      }
    }

    if (!supabaseAdmin || supabaseError) {
      persistEventLocally(event);
    }

    void audit(
      'memory.event.ingested',
      user.userId,
      {
        source: event.source,
        provider: sanitizedModelDecision?.provider,
        routedModel: sanitizedModelDecision?.routedModel,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        latencyMs: event.latencyMs,
        toolCount: Array.isArray(event.toolInvocations) ? event.toolInvocations.length : 0,
      },
      req
    );

    void logger.info('[memory/events] Memory event ingested', {
      userId: user.userId,
      eventId: event.id,
      source: event.source,
      status: supabaseError ? 'offline-fallback' : 'success',
    });

    return NextResponse.json({ success: true, eventId: event.id, status: supabaseError ? 'offline-fallback' : 'success' });
  } catch (error: any) {
    return respondMemoryEventError(req, 500, { error: 'Memory event ingest failed', details: error?.message ?? 'unknown error' });
  }
}

export async function GET(req: Request) {
  try {
    let user;
    try {
      user = await requireAuth();
    } catch (authError) {
      return handleAuthError(authError);
    }

    try {
      const ip = getClientIP(req);
      const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');

      if (!rateLimit.success) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }

      if (!supabaseAdmin) {
        return NextResponse.json({ success: true, events: [], memoryEvents: [] });
      }

      const { searchParams } = new URL(req.url);
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

      const { data, error } = await supabaseAdmin
        .from('memory_events')
        .select('*')
        .eq('user_id', user.userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('[memory/events] list query failed', error);
        return NextResponse.json({ success: true, events: [], memoryEvents: [] });
      }

      return NextResponse.json({
        success: true,
        events: data ?? [],
        memoryEvents: data ?? [],
      });
    } catch (error) {
      console.error('[memory/events] list error', error);
      return NextResponse.json({ success: true, events: [], memoryEvents: [] });
    }
  } catch (error: any) {
    return respondMemoryEventError(req, 500, { error: 'Memory event list failed', details: error?.message ?? 'unknown error' });
  }
}
