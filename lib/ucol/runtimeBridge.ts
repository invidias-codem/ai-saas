import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { runPostGenerationPipeline } from '@/lib/ucol/postGenerationPipeline';
import { logger } from '@/lib/logger';
import { handleAuthError } from '@/lib/security/apiAuth';
import {
  calculateInteractionCost,
  getUserCredits,
  deductUserCredits,
  hasUnlimitedUsageAccess,
} from '@/lib/subscription/credits';
import type { SessionSetupResult } from './sessionHandler';
import type { RuntimeContextResult } from './runtimeContextResolver';
import type { UcolRoutingDecision } from './routing/types';
import type { FileAttachmentInput } from '@/lib/types/attachments';
import { startUcolSpan, type UcolSpan } from '@/lib/ucol/observability/span';
import { emitInteractionAudit } from '@/lib/telemetry/emit';
import { deriveContextRole } from '@/lib/telemetry/governance';
import { logRoutingTelemetry } from '@/lib/ucol/routing/telemetryLogger';

export interface ExecuteRuntimeFnInput {
  resolved: RuntimeContextResult;
  requestId: string;
  rawInput: string;
  messages: any[];
  fileData: FileAttachmentInput | null | undefined;
  body: any;
  span?: import('@/lib/ucol/observability/span').UcolSpan;
}

export interface ExecuteRuntimeFnResult {
  text?: string;
  stream?: ReadableStream;
  thoughtSignaturePromise?: Promise<any>;
  modelId?: string;
  requestedModelId?: string;
  actualModelId?: string;
  systemProvider?: string;
  routingDecision?: UcolRoutingDecision;
  userContext?: any;
  intelligentFacts?: any;
  span?: import('@/lib/ucol/observability/span').UcolSpan;
}

export type ExecuteRuntimeFn = (input: ExecuteRuntimeFnInput) => Promise<ExecuteRuntimeFnResult>;

export interface RuntimeBridgeOptions {
  surface: 'chat' | 'code' | string;
  session: SessionSetupResult;
  requestId: string;
  featureType: 'chat' | 'code';
  body: any;
  execute: ExecuteRuntimeFn;
  billing?: (input: BillingInput) => Promise<BillingResult>;
}

export interface BillingInput {
  userId: string;
  clerkUser: any;
  rawInput: string;
  fileData?: FileAttachmentInput | null;
  mode: string;
  featureType: string;
}

export interface BillingResult {
  cost: number;
  bypass: boolean;
  remaining: number;
  spendResult?: any;
}

async function defaultBilling(input: BillingInput): Promise<BillingResult> {
  const { userId, rawInput, fileData, mode, featureType } = input;

  const computeCredits = await getUserCredits(userId);
  const cost = calculateInteractionCost({
    hasAttachments: Boolean(fileData),
    mode: mode as any,
  });

  const remaining = Math.max(0, computeCredits - cost);
  if (remaining <= 0 && computeCredits < cost) {
    return { cost, bypass: false, remaining: computeCredits };
  }

  return { cost, bypass: false, remaining };
}

async function drainStreamForPostGen(
  reader: ReadableStreamDefaultReader,
  decoder: TextDecoder,
  thoughtSignatureSource: () => Promise<any>,
) {
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  const thoughtSignature = await thoughtSignatureSource().catch(() => null);
  return { text: fullText, thoughtSignature };
}

export async function runRuntimeBridge(options: RuntimeBridgeOptions): Promise<NextResponse> {
  const {
    surface,
    session,
    requestId,
    featureType,
    body,
    execute,
    billing: billingOverride,
  } = options;

  if (session.errorResponse) return session.errorResponse;

  const resolved = session.resolvedContext!;
  const clerkUser = session.clerkUser!;
  const user = session.user!;
  const rawInput = body?.prompt || body?.currentUserPrompt || '';
  const messages = body?.messages || [];
  const fileData: FileAttachmentInput | undefined = body?.fileData;

  const span = startUcolSpan({
    name: `${surface}.runtime`,
    userId: user.userId,
    sessionId: resolved.conversationId || undefined,
    surface,
    tags: [resolved.mode],
    macroWorkflowId: resolved.conversationId ?? undefined,
  });

  const billingInput: BillingInput = {
    userId: user.userId,
    clerkUser,
    rawInput,
    fileData,
    mode: resolved.mode,
    featureType,
  };

  const billing = await (billingOverride ?? defaultBilling)(billingInput);

  const masterAccess = await hasUnlimitedUsageAccess(user.userId, clerkUser?.emailAddresses?.[0]?.emailAddress || null);
  if (masterAccess) {
    Object.assign(billing, { bypass: true, remaining: billing.cost });
  }

  if (!billing.bypass && billing.remaining < billing.cost) {
    span.fail(new Error('Insufficient credits'));
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        message: featureType === 'code'
          ? 'Weaver Code requires credits before generation starts.'
          : 'Credits exhausted. Please upgrade to continue.',
        remaining: billing.remaining,
      },
      { status: 402, headers: buildTraceHeaders(span) }
    );
  }

  const execInput: ExecuteRuntimeFnInput = {
    resolved,
    requestId,
    rawInput,
    messages,
    fileData,
    body,
    span,
  };

  let execResult: ExecuteRuntimeFnResult;
  try {
    execResult = await execute(execInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    span.fail(message);
    return NextResponse.json(
      {
        error: 'Execution failed',
        details: process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : message,
      },
      { status: 500, headers: buildTraceHeaders(span) }
    );
  }

  const effectiveStream = execResult.stream;
  if (effectiveStream && surface === 'chat') {
    const [readerStream, writerStream] = effectiveStream.tee();
    execResult = { ...execResult, stream: writerStream };

    waitUntil(
      drainStreamForPostGen(
        readerStream.getReader(),
        new TextDecoder(),
        () =>
          Promise.resolve(execResult.thoughtSignaturePromise)
            .then((v: any) => v)
            .catch(() => null)
      ).then(({ text, thoughtSignature }) => {
        const resultSpan = execResult.span || span;
        resultSpan.end({ responseLength: text.length });
        emitAuditFromResult(resultSpan, execResult, resolved, user.userId, billing, featureType);
        const streamOutcome = text ? 'success' : 'failed';
        const streamCorrectionSignal = execResult.routingDecision?.intent?.urgency === 'high' ? 'implicit' : 'none';
        waitUntil(
          logRoutingTelemetry({
            decision: execResult.routingDecision,
            latencyMs: resultSpan.durationMs,
            estimatedCostUsd: billing.cost,
            outcome: streamOutcome,
            userCorrectionSignal: streamCorrectionSignal,
          }).catch((err: any) => console.debug('[RoutingTelemetry] stream failed:', err?.message || err))
        );
        return runPostGenerationPipeline({
          userId: user.userId,
          conversationId: resolved.conversationId,
          workspaceId: resolved.workspaceId,
          operatingProfileId: resolved.operatingProfileId,
          operatingProfileMode: resolved.mode,
          requestId,
          userQuery: rawInput,
          responseText: text,
          history: messages,
          fileData: fileData || null,
          modelId: execResult.modelId || 'unknown',
          cost: billing.cost,
          bypassCredits: billing.bypass,
          featureType,
          intelligentFacts: execResult.intelligentFacts,
          routingDecision: execResult.routingDecision,
          userContext: {
            fullName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'User',
            email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
          },
          saveToMemory: body?.saveToMemory || false,
          persistUserMessage: true,
          thoughtSignature,
        } as any);
      }).catch((err: any) => {
        span.fail(err);
        logger.error('[RuntimeBridge] Background pipeline failed', { error: err?.message || String(err) });
      })
    );
  }

  if (effectiveStream && surface === 'chat') {
    if (billing.cost > 0 && !billing.bypass) {
      waitUntil(
        deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
      );
    }

    span.end({ responseVia: 'stream' });
    emitAuditFromResult(span, execResult, resolved, user.userId, billing, featureType);

    const responseStream = execResult.stream || effectiveStream;

    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Debug-Model': execResult.modelId || 'unknown',
        'X-Debug-Agent-Mode': resolved.mode,
        'X-Debug-Execution-Mode': execResult.routingDecision?.executionPlan?.mode || 'direct',
        'X-Debug-Intent': execResult.routingDecision?.intent?.category || 'general',
        'X-Remaining-Credits': String(Math.max(0, billing.remaining)),
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
        ...buildTraceHeaders(span),
      } as Record<string, string>,
    });
  }

  if (billing.cost > 0 && !billing.bypass) {
    waitUntil(
      deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
    );
  }

  span.end({ responseVia: 'json' });
  emitAuditFromResult(span, execResult, resolved, user.userId, billing, featureType);

  const outcome = execResult.text ? 'success' : 'failed';
  const userCorrectionSignal = execResult.routingDecision?.intent?.urgency === 'high' ? 'implicit' : 'none';

  waitUntil(
    logRoutingTelemetry({
      decision: execResult.routingDecision,
      latencyMs: span.durationMs,
      estimatedCostUsd: billing.cost,
      outcome,
      userCorrectionSignal,
    }).catch((err: any) => console.debug('[RoutingTelemetry] failed:', err?.message || err))
  );

  return NextResponse.json(
    { text: execResult.text || '' },
    {
      headers: {
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
        ...buildTraceHeaders(span),
      } as Record<string, string>,
    }
  );
}

function buildTraceHeaders(span: import('@/lib/ucol/observability/span').UcolSpan) {
  return {
    'X-Lattice-Trace-Id': span.traceId,
    'X-Lattice-Span-Id': span.spanId,
  } as Record<string, string>;
}

async function emitAuditFromResult(
  span: import('@/lib/ucol/observability/span').UcolSpan,
  execResult: ExecuteRuntimeFnResult,
  resolved: RuntimeContextResult,
  userId: string,
  billing: { cost: number },
  featureType: 'chat' | 'code'
) {
  try {
    emitInteractionAudit(span.toAuditInput({
      requestedModelId: execResult.requestedModelId,
      actualModelId: execResult.actualModelId,
      systemProvider: execResult.systemProvider,
      agentName: resolved.mode,
      agentRole: featureType,
      creditCost: billing.cost,
      contextRole: deriveContextRole({ workspaceId: resolved.workspaceId, agentMode: resolved.mode }),
    }));
  } catch (telemetryErr) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[observability] bridge audit emit failed (non-blocking):', telemetryErr);
    }
  }
}

export function bridgeErrorHandler(error: unknown): NextResponse | null {
  const authResponse = handleAuthError(error);
  if (authResponse) return authResponse;

  if (error instanceof Error) {
    if (error.message?.includes('429')) {
      return NextResponse.json(
        { error: 'Too Many Requests', details: 'The agent is currently experiencing high load. Please try again.' },
        { status: 429 }
      );
    }
  }

  logger.error('[RuntimeBridge] Unhandled execution error', {
    message: error instanceof Error ? error.message : String(error),
    stack: process.env.NODE_ENV === 'development' && error instanceof Error
      ? error.stack
      : undefined,
  });

  return NextResponse.json(
    {
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error instanceof Error
          ? error.message
          : String(error),
    },
    { status: 500 }
  );
}
