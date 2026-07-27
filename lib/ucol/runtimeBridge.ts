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
} from '@/lib/subscription/credits';
import type { SessionSetupResult } from './sessionHandler';
import type { RuntimeContextResult } from './runtimeContextResolver';
import type { UcolRoutingDecision } from './routing/types';
import type { FileAttachmentInput } from '@/lib/types/attachments';

export interface ExecuteRuntimeFnInput {
  resolved: RuntimeContextResult;
  requestId: string;
  rawInput: string;
  messages: any[];
  fileData: FileAttachmentInput | null | undefined;
  body: any;
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

  const billingInput: BillingInput = {
    userId: user.userId,
    clerkUser,
    rawInput,
    fileData,
    mode: resolved.mode,
    featureType,
  };

  const billing = await (billingOverride ?? defaultBilling)(billingInput);

  if (!billing.bypass && billing.remaining < billing.cost) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        message: featureType === 'code'
          ? 'Weaver Code requires credits before generation starts.'
          : 'Credits exhausted. Please upgrade to continue.',
        remaining: billing.remaining,
      },
      { status: 402 }
    );
  }

  const execInput: ExecuteRuntimeFnInput = {
    resolved,
    requestId,
    rawInput,
    messages,
    fileData,
    body,
  };

  const execResult = await execute(execInput);

  let clientStream = execResult.stream;
  if (clientStream && surface === 'chat') {
    const [readerStream, writerStream] = clientStream.tee();
    clientStream = writerStream;

    waitUntil(
      drainStreamForPostGen(
        readerStream.getReader(),
        new TextDecoder(),
        () =>
          Promise.resolve(execResult.thoughtSignaturePromise)
            .then((v: any) => v)
            .catch(() => null)
      ).then(({ text, thoughtSignature }) => {
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
        logger.error('[RuntimeBridge] Background pipeline failed', { error: err?.message || String(err) });
      })
    );
  }

  if (execResult.stream && surface === 'chat') {
    if (billing.cost > 0 && !billing.bypass) {
      waitUntil(
        deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
      );
    }

    return new NextResponse(clientStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Debug-Model': execResult.modelId || 'unknown',
        'X-Debug-Agent-Mode': resolved.mode,
        'X-Debug-Execution-Mode': execResult.routingDecision?.executionPlan?.mode || 'direct',
        'X-Debug-Intent': execResult.routingDecision?.intent?.category || 'general',
        'X-Remaining-Credits': String(Math.max(0, billing.remaining)),
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
      } as Record<string, string>,
    });
  }

  if (billing.cost > 0 && !billing.bypass) {
    waitUntil(
      deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
    );
  }

  return NextResponse.json(
    { text: execResult.text || '' },
    {
      headers: {
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
      } as Record<string, string>,
    }
  );
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
