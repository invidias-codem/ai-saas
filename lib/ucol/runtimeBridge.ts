// lib/ucol/runtimeBridge.ts
//
// Phase 2 — Runtime Bridge
//
// Owns the shared orchestration layer that both chat and code surfaces
// currently duplicate inside their route handlers:
//   1. credit enforcement with graceful degradation
//   2. execution dispatch
//   3. post-generation pipeline (background persistence, memory, telemetry)
//   4. response assembly (streaming for chat, JSON for code)
//
// After this lands, each API route should shrink to ~20-30 lines:
//
//   export async function POST(req: Request) {
//     const session = await setupUcolSession(req, ...);
//     if (session.errorResponse) return session.errorResponse;
//     return runRuntimeBridge({ surface: 'code', session, ... });
//   }

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

// ─── Types ────────────────────────────────────────────────────────

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
  stream?: ReadableStream<Uint8Array>;
  thoughtSignaturePromise?: Promise<any>;
  modelId?: string;
  /** Sovereign telemetry: model id initially requested (pre override/fallback). */
  requestedModelId?: string;
  /** Sovereign telemetry: model id actually executed (post override/fallback). */
  actualModelId?: string;
  /** Sovereign telemetry: serving provider id (anthropic|openai|google|local). */
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
  /**
   * Optional: route-specific billing override.
   * When omitted, the bridge runs its own default billing flow.
   * Return { cost, bypass, remaining } — bridge handles the rest.
   */
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

// ─── Internal billing ────────────────────────────────────────────

async function defaultBilling(input: BillingInput): Promise<BillingResult> {
  const { userId, rawInput, fileData, mode, featureType } = input;

  const computeCredits = await getUserCredits(userId);
  const cost = calculateInteractionCost({
    hasAttachments: Boolean(fileData),
    mode: mode as any,
  });

  // Simple balance check; no atomic spend available in current credits module.
  // We check here and again inside the route where needed.
  const remaining = Math.max(0, computeCredits - cost);
  if (remaining <= 0 && computeCredits < cost) {
    return { cost, bypass: false, remaining: computeCredits };
  }

  return { cost, bypass: false, remaining: Math.max(0, computeCredits - cost) };
}

// ─── Bridge ───────────────────────────────────────────────────────

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

  // --- Phase 2a: billing ──────────────────────────────────────
  const billingInput: BillingInput = {
    userId: user.userId,
    clerkUser,
    rawInput,
    fileData,
    mode: resolved.mode,
    featureType,
  };

  const billing = await (billingOverride ?? defaultBilling)(billingInput);

  // If pre-spend failed, short-circuit before any model call
  if (!billing.bypass && billing.remaining < billing.cost) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        message: featureType === 'code'
          ? `Weaver Code requires ${billing.cost} credits before generation starts.`
          : 'Credits exhausted. Please upgrade to continue.',
        remaining: billing.remaining,
      },
      { status: 402 }
    );
  }

  // --- Phase 2b: execute ──────────────────────────────────────
  const execInput: ExecuteRuntimeFnInput = {
    resolved,
    requestId,
    rawInput,
    messages,
    fileData,
    body,
  };

  const execResult = await execute(execInput);

  // --- Phase 2c: post-generation pipeline ─────────────────────
  const postGenPayload = {
    userId: user.userId,
    conversationId: resolved.conversationId,
    workspaceId: resolved.workspaceId,
    operatingProfileId: resolved.operatingProfileId,
    operatingProfileMode: resolved.mode,
    requestId,
    userQuery: rawInput,
    responseText: execResult.text || '',
    history: messages,
    fileData: fileData || null,
    modelId: execResult.modelId || 'unknown',
    cost: billing.cost,
    bypassCredits: billing.bypass,
    featureType,
    intelligentFacts: execResult.intelligentFacts,
    routingDecision: execResult.routingDecision,
    userContext: {
      fullName: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim()
        || clerkUser.username || 'User',
      email: clerkUser.emailAddresses?.[0]?.emailAddress || '',
    },
    saveToMemory: body?.saveToMemory || false,
    persistUserMessage: true,
  } as any;

  if (execResult.stream && surface === 'chat') {
    // Streaming path: drain in background, then persist with thoughtSignature
    const reader = execResult.stream.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    waitUntil(
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
          }
          const thoughtSignature = await Promise.resolve(
            execResult.thoughtSignaturePromise ?? Promise.resolve(null)
          ).catch(() => null);

          await runPostGenerationPipeline({
            ...postGenPayload,
            responseText: fullText,
            thoughtSignature,
          });
        } catch (err: any) {
          logger.error('[RuntimeBridge] Background pipeline failed', {
            error: err?.message || String(err),
          });
        }
      })()
    );
  } else {
    // Non-streaming / code path: persist immediately before returning
    try {
      await runPostGenerationPipeline({
        ...postGenPayload,
        thoughtSignature: null,
      });
    } catch (err: any) {
      logger.error('[RuntimeBridge] Post-generation pipeline failed', {
        error: err?.message || String(err),
      });
    }
  }

  // --- Phase 2d: response ─────────────────────────────────────
  if (execResult.stream && surface === 'chat') {
    // Asynchronous charge for streaming paths
    if (billing.cost > 0 && !billing.bypass) {
      waitUntil(
        deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
      );
    }

    return new NextResponse(execResult.stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Debug-Model': execResult.modelId || 'unknown',
        'X-Debug-Agent-Mode': resolved.mode,
        'X-Debug-Execution-Mode': execResult.routingDecision?.executionPlan?.mode || 'direct',
        'X-Debug-Intent': execResult.routingDecision?.intent?.category || 'general',
        'X-Remaining-Credits': String(Math.max(0, billing.remaining)),
        // Sovereign telemetry: edge SW reads these to capture the audit record.
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
      } as Record<string, string>,
    });
  }

  // JSON response path
  if (billing.cost > 0 && !billing.bypass) {
    waitUntil(
      deductUserCredits(user.userId, Math.max(0, billing.remaining), billing.cost)
    );
  }
  return NextResponse.json(
    surface === 'code' ? { text: execResult.text || '' } : { text: execResult.text || '' },
    {
      headers: {
        'x-telemetry-model': execResult.actualModelId || execResult.modelId || 'unknown',
        'x-telemetry-provider': execResult.systemProvider || 'unknown',
      } as Record<string, string>,
    }
  );
}

// ─── Error funnel ────────────────────────────────────────────────

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
