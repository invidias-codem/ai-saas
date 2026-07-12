// app/api/code/route.ts
//
// Phase 2 refactor: atomic thin transport.
// Route now owns ONLY: custom file validation.
// Everything else (auth, rate-limit, context, billing, execution, post-gen, response) is delegated.
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { runCodeEngine } from '@/lib/llm/codeEngine';
import { validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { setupUcolSession } from '@/lib/ucol/sessionHandler';
import { runRuntimeBridge } from '@/lib/ucol/runtimeBridge';
import type { FileAttachmentInput } from '@/lib/types/attachments';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // --- Phase 2: session bootstrap ----------------------------------
    const session = await setupUcolSession({
      req,
      maxRequestSizeBytes: 10 * 1024 * 1024,
      surface: 'api',
      strictValidation: true,
    });
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
    return runRuntimeBridge({
      surface: 'code',
      session,
      requestId,
      featureType: 'code',
      body,
      execute: async ({ resolved: ctx, rawInput, messages: msgs, fileData: attachedFileData }) => {
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
      },
    });

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
