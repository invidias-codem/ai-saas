// app/api/code/route.ts
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Part } from "@google/generative-ai";
import { requireEnv } from '@/lib/env';
import { waitUntil } from '@vercel/functions';
import { runPostGenerationPipeline } from '@/lib/ucol/postGenerationPipeline';
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { validateRequestSize, ValidationError, fileUploadSchema } from '@/lib/security/inputValidation';
import { CODE_MODELS } from '@/lib/llm/codeModels';
import { runCodeEngine } from '@/lib/llm/codeEngine';
import { checkCredits, deductCredits, spendCreditsAtomic, CREDIT_COSTS, hasUnlimitedUsageAccess } from "@/lib/credits";
import { trackAIError } from "@/lib/analytics/track";
import { logger } from "@/lib/logger";
import { resolveRuntimeContext } from '@/lib/ucol/runtimeContextResolver';
import type { RuntimeProfileSignals, OperatingProfileMode } from '@/lib/workspaces/runtimeMode';

export const runtime = 'nodejs';



export async function POST(req: Request) {
  try {
    // 1. Authentication
    const user = await requireAuth();
    const clerkUser = await currentUser();
    const ip = getClientIP(req);

    if (!clerkUser) {
      return new NextResponse("User profile not found", { status: 401 });
    }

    // 2. Rate Limiting (AI endpoint - strict limits)
    const rateLimit = await limitApiEndpoint(user.userId, ip, 'ai');
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', message: 'Code generation rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            'X-RateLimit-Remaining': String(rateLimit.remaining)
          }
        }
      );
    }

    // 3. Validate Request Size
    const body = await req.json();
    validateRequestSize(body, 10 * 1024 * 1024); // 10MB for code files

    const { messages, currentUserPrompt, fileData, model = 'fast', activeRepo, workspaceId, operatingProfileId, operatingProfileMode, conversationId } = body;
    let modelConfig = CODE_MODELS[model] || CODE_MODELS.fast;

    const resolved = await resolveRuntimeContext({ 
      userId: user.userId, 
      surface: 'api', 
      conversationId, 
      workspaceId, 
      operatingProfileId, 
      fallbackMode: operatingProfileMode,
      strictValidation: true 
    });

    if (resolved.error) {
      return NextResponse.json({ error: resolved.error.message }, { status: resolved.error.status });
    }

    const validatedConversationId = resolved.conversationId;
    const effectiveProfile = resolved.profile;
    const operatingProfileResolvedMode = resolved.mode;
    const operatingProfileName = resolved.operatingProfileName ?? resolved.operatingProfileId ?? 'resolved';
    
    // Fallback if needed for workspaceId, operatingProfileId locally
    const effectiveWorkspaceId = resolved.workspaceId;
    const effectiveOperatingProfileId = resolved.operatingProfileId;

    // 4. Input Validation
    if (!messages && (!currentUserPrompt && !fileData)) {
      return new NextResponse("Messages or prompt/file are required", { status: 400 });
    }

    // Validate file if provided
    if (fileData) {
      const fileValidation = fileUploadSchema.safeParse(fileData);
      if (!fileValidation.success) {
        return NextResponse.json(
          { error: 'Invalid file data', details: fileValidation.error.flatten() },
          { status: 400 }
        );
      }
      // Size check for base64 data (rough estimate: base64 is ~1.33x original)
      const estimatedSize = fileData.base64Data.length * 0.75;
      if (estimatedSize > 5 * 1024 * 1024) { // 5MB file limit
        return NextResponse.json(
          { error: 'File too large', details: 'Maximum file size is 5MB' },
          { status: 400 }
        );
      }
    }

    // Adapt history (strip file placeholders)
    // Adapt history (restore files from persistent history)
    const history = (messages || []).slice(0, -1).map((msg: {
      role: string;
      text: string;
      fileData?: { mimeType?: string; type?: string; base64Data: string; name: string }
    }) => {
      const parts: Part[] = [{ text: msg.text || '' }];

      // Re-attach file if present in history
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
        parts: parts,
      };
    });

    // 5. Pre-generation Credit Check (Atomic)
    const cost = CREDIT_COSTS.CODE_GENERATION;
    const idempotencyKey = req.headers.get('idempotency-key') || `code-${user.userId}-${Date.now()}`;
    const bypassCredits = await hasUnlimitedUsageAccess(user.userId);

    if (!bypassCredits) {
      const spendResult = await spendCreditsAtomic(user.userId, cost, idempotencyKey, "Code generation", { model: modelConfig.modelId, activeRepo });

      if (!spendResult.success && !spendResult.duplicate) {
        return NextResponse.json(
          {
            error: 'Insufficient credits',
            message: `Weaver Code requires ${cost} credits before generation starts.`,
            remaining: spendResult.remaining,
          },
          { status: 402 }
        );
      }
    }

    const userQuery = currentUserPrompt || 'code assistance';

    const {
      responseText,
      modelConfig: finalModelConfig,
      routingDecision,
      intelligentFacts,
      userContext
    } = await runCodeEngine({
      userId: user.userId,
      clerkUser,
      userQuery,
      history,
      fileData,
      activeRepo,
      initialModelConfig: modelConfig,
      resolvedContext: resolved,
      requestId: req.headers.get('x-request-id') || `req-${Date.now()}`,
      messagesLength: messages?.length || 0
    });
    
    // Ensure we use the possibly updated modelConfig from the engine
    modelConfig = finalModelConfig;

    waitUntil(
      runPostGenerationPipeline({
        userId: user.userId,
        conversationId: validatedConversationId,
        workspaceId: effectiveWorkspaceId,
        operatingProfileId: effectiveOperatingProfileId,
        operatingProfileMode: operatingProfileResolvedMode,
        requestId: req.headers.get('x-request-id') || `req-${Date.now()}`,
        userQuery,
        responseText,
        history: messages || [],
        fileData: fileData || null,
        modelId: modelConfig.modelId,
        cost,
        bypassCredits,
        featureType: 'code',
        intelligentFacts,
        routingDecision,
        userContext: {
          fullName: userContext?.fullName || clerkUser?.fullName || 'Unknown User',
          email: userContext?.email || clerkUser?.emailAddresses?.[0]?.emailAddress || 'unknown@example.com',
          interactionStyle: userContext?.interactionStyle
        },
        saveToMemory: body.saveToMemory,
        persistUserMessage: true,
      })
    );

    return NextResponse.json({ text: responseText });

  } catch (error: any) {
    console.error("[CODE_API_ERROR]", error);

    // Handle auth/validation errors
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    if (error instanceof ValidationError) {
      return NextResponse.json({
        error: 'Validation Error',
        details: error.message
      }, { status: 400 });
    }

    if (error.response?.data?.error) {
      logger.error("Gemini API Error:", error.response.data.error);
    }
    const errorMessage = error.response?.data?.error?.message || error.message || "An unknown error occurred";
    return new NextResponse(JSON.stringify({
      error: "Internal Server Error",
      details: errorMessage
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}