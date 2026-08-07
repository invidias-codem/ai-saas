// app/api/code/route.ts
//
// Phase 2 refactor: atomic thin transport.
// Route now owns ONLY: custom file validation + direct execution sandbox.
// Everything else (auth, rate-limit, context, billing, execution, post-gen, response) is delegated.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { runCodeEngine } from '@/lib/llm/codeEngine';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { setupUcolSession } from '@/lib/ucol/sessionHandler';
import { runRuntimeBridge } from '@/lib/ucol/runtimeBridge';
import { isolatedRunner } from '@/lib/execution/isolatedRunner';
import type { FileAttachmentInput } from '@/lib/types/attachments';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // --- Direct execution path (before auth) --------------------------
    const bypassToken = process.env.LATTICE_CODE_BYPASS_TOKEN;
    const isDevBypass = !!bypassToken && process.env.NODE_ENV !== 'production';

    const contentType = req.headers.get('content-type') || '';
    let executeBody: { code?: string; language?: string; timeoutMs?: number; workflow?: boolean } | null = null;
    if (contentType.includes('application/json')) {
      try {
        executeBody = await req.json();
      } catch {
        executeBody = null;
      }
    }

    if (executeBody && executeBody.code && typeof executeBody.code === 'string') {
      if (isDevBypass) {
        const provided = req.headers.get('x-lattice-bypass');
        if (!provided || provided !== bypassToken) {
          return new Response(JSON.stringify({ error: 'Missing bypass token' }), { status: 401 });
        }
      }

      const language = (executeBody.language === 'python' || executeBody.language === 'javascript' || executeBody.language === 'typescript' || executeBody.language === 'sh')
        ? executeBody.language
        : 'typescript';
      const timeoutMs = typeof executeBody.timeoutMs === 'number' ? executeBody.timeoutMs : 10_000;

      const traceId = req.headers.get('x-lattice-trace-id') || randomUUID();

      let executionResult: { executionId: string; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number } | null = null;

      executionResult = await isolatedRunner.execute({
        code: executeBody.code as string,
        language,
        timeoutMs,
        traceId,
      });

      const responseBody: any = { ...executionResult };

      if (executeBody.workflow) {
        const { durableEngine } = await import('@/lib/ucol/runtime/durableEngine');
        const context = await durableEngine.startWorkflow('execute', {
          code: executeBody.code as string,
          language,
          timeoutMs,
        });

        await durableEngine.executeStep(context, async () => {
          return executionResult;
        });

        return new Response(JSON.stringify({ workflowId: context.workflowId, ...responseBody }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Lattice-Trace-Id': traceId,
          },
        });
      }

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Lattice-Trace-Id': traceId,
        },
      });
    }

    // --- Phase 2: session bootstrap ----------------------------------
    let session;
    try {
      session = await setupUcolSession({
        req,
        maxRequestSizeBytes: 10 * 1024 * 1024,
        surface: 'api',
        strictValidation: true,
        requestBody: executeBody ?? undefined,
      });
    } catch (sessionErr: any) {
      console.error('[code] session bootstrap failed', sessionErr);
      return NextResponse.json(
        { error: 'Session setup failed', details: sessionErr?.message || String(sessionErr) },
        { status: 500 }
      );
    }
    if (session.errorResponse) return session.errorResponse;

    const { user, clerkUser, body, resolvedContext } = session;
    const {
      messages,
      currentUserPrompt,
      fileData,
      model = 'fast',
      activeRepo,
    } = body;

    let modelConfig = CODE_MODELS[model] || CODE_MODELS.fast;

    // --- Custom file validation (code-specific) -----------------------
    if (fileData) {
      const fileValidation = fileUploadSchema.safeParse(fileData);
      if (!fileValidation.success) {
        return NextResponse.json(
          { error: 'Invalid file data', details: fileValidation.error.flatten() },
          { status: 400 }
        );
      }
      if (fileData.base64Data) {
        const estimatedSize = fileData.base64Data.length * 0.75;
        if (estimatedSize > 5 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'File too large', details: 'Maximum inline file size is 5MB' },
            { status: 400 }
          );
        }
      }
    }

    if (!messages && (!currentUserPrompt && !fileData)) {
      return new NextResponse("Messages or prompt/file are required", { status: 400 });
    }

    if (messages && Array.isArray(messages) && messages.length > 100) {
      return NextResponse.json(
        { error: 'Validation Error', details: 'Maximum 100 messages allowed in history' },
        { status: 400 }
      );
    }

    const requestId = req.headers.get('x-request-id') || randomUUID();

    // --- Phase 2: delegate to bridge ---------------------------------
    try {
      return await runRuntimeBridge({
        surface: 'code',
        session,
        requestId,
        featureType: 'code',
        body,
        execute: async ({ resolved: ctx, rawInput, messages: msgs, fileData: attachedFileData }) => {
          try {
            const history = (msgs || []).slice(0, -1).map((msg: {
              role: string;
              text: string;
              fileData?: FileAttachmentInput;
            }) => {
              const parts: Part[] = [{ text: msg.text || '' }];
              if (msg.fileData && msg.fileData.base64Data) {
                parts.push({
                  inlineData: {
                    mimeType: msg.fileData.mimeType || msg.fileData.type || 'text/plain',
                    data: msg.fileData.base64Data
                  }
                });
              }
              return {
                role: msg.role === 'bot' ? 'model' : 'user',
                parts,
              };
            });

            const {
              responseText,
              modelConfig: finalModelConfig,
              routingDecision,
              intelligentFacts,
              userContext
            } = await runCodeEngine({
              userId: user.userId,
              clerkUser,
              userQuery: rawInput,
              history,
              fileData: attachedFileData ?? undefined,
              activeRepo,
              initialModelConfig: modelConfig,
              resolvedContext: ctx,
              requestId,
              messagesLength: msgs?.length || 0,
            });

            return {
              text: responseText,
              modelId: finalModelConfig.modelId,
              routingDecision,
              intelligentFacts,
              userContext,
            };
          } catch (engineErr: any) {
            console.error('[code] engine execution failed', engineErr);
            throw new Error(`Code engine failed: ${engineErr?.message || String(engineErr)}`);
          }
        },
      });
    } catch (bridgeErr: any) {
      console.error('[code] runtimeBridge failed', bridgeErr);
      const message = bridgeErr?.message || String(bridgeErr);
      const status = message.includes('Insufficient credits') ? 402 : 500;
      return NextResponse.json(
        {
          error: 'Code generation failed',
          details: process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : message,
          ...(process.env.NODE_ENV !== 'production' ? { stack: bridgeErr?.stack } : {}),
        },
        { status }
      );
    }

  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({
        error: 'Validation Error',
        details: error.message
      }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error?.response?.data?.error?.message || error.message || "An unknown error occurred"
      },
      { status: 500 }
    );
  }
}
