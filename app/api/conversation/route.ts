// app/api/conversation/route.ts
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { trackAIGeneration, trackAIError, trackCreditsDeducted } from "@/lib/analytics/track";

import {
  ConversationRequestSchema,
  generateConversationReply,
} from "@/lib/llm/conversationEngine";
import { checkCredits, deductCredits, spendCreditsAtomic, refundCredits, CREDIT_COSTS } from "@/lib/credits";
import { requireAuth, handleAuthError } from "@/lib/security/apiAuth";
import { checkTokenBudget, recordTokenUsage } from "@/lib/security/budgetGuard";
import { estimateTokenCount } from "@/lib/ragMemory";
import { audit } from "@/lib/security/auditLog";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    // 1. Authentication
    // requireAuth throws specific errors that handleAuthError converts to standardized JSON responses
    const user = await requireAuth();

    // Get full Clerk user object for context
    const clerkUser = await currentUser();
    // requireAuth guarantees userId, but currentUser might fail internally (unlikely if auth passed)
    if (!clerkUser) {
      // Should be handled by requireAuth usually, but safe fallback
      console.error("[Conversation API] requireAuth passed but currentUser failed");
      return NextResponse.json(
        { error: "Unauthorized", message: "User profile not found." },
        { status: 401 }
      );
    }
    const userId = user.userId;

    const body = await req.json();

    const validationResult = ConversationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation Error",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    // 3. Token Budget Check (pre-flight — prevents runaway LLM spend)
    const userQuery = validationResult.data.messages.at(-1)?.text ?? '';
    const estimatedTokens = estimateTokenCount(userQuery) + 2048; // query + max response
    const budgetCheck = await checkTokenBudget(userId, estimatedTokens);
    if (!budgetCheck.allowed) {
      void audit('chat.budget_exceeded', userId, { tier: budgetCheck.tier, used: budgetCheck.tokensUsedThisMonth, budget: budgetCheck.tokenBudget }, req);
      return NextResponse.json(
        { error: 'Token Budget Exceeded', message: budgetCheck.reason },
        { status: 402 }
      );
    }

    // Log chat request
    void audit('chat.request', userId, { estimatedTokens, tier: budgetCheck.tier }, req);

    // 4. Credit Check (Atomic)
    const cost = CREDIT_COSTS.CHAT_MESSAGE;
    const idempotencyKey = req.headers.get('idempotency-key') || `chat-${userId}-${Date.now()}`;

    const spendResult = await spendCreditsAtomic(userId, cost, idempotencyKey, "Chat message");

    if (!spendResult.success && !spendResult.duplicate) {
      return NextResponse.json(
        { error: "Insufficient credits", message: `You need ${cost} credits for this request.`, remaining: spendResult.remaining },
        { status: 402 }
      );
    }

    let result;
    try {
      result = await generateConversationReply(
        {
          userId,
          clerkUser,
          request: validationResult.data,
        },
        {
          disableSideEffects: process.env.DISABLE_SIDE_EFFECTS === "true",
          disableExternalContext: process.env.DISABLE_EXTERNAL_CONTEXT === "true",
        }
      );
    } catch (error) {
      // Refund logic
      if (!spendResult.duplicate) {
        logger.info(`[Conversation API] Generation failed, refunding ${cost} credits to ${userId}`);
        await refundCredits(userId, cost, "Refund for failed chat generation");
      }
      throw error;
    }

    // Record actual token usage (fire-and-forget — never blocks response)
    const modelUsed = result.debug?.model ?? 'gemini-3.1-flash-lite-preview';
    void recordTokenUsage(userId, estimatedTokens, modelUsed);

    // Track analytics (fire-and-forget)
    void trackAIGeneration({ tool: 'chat', model: modelUsed, userId, tokenCount: estimatedTokens, success: true });
    void trackCreditsDeducted({ tool: 'chat', credits: cost, userId });

    // Return the stream directly
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Debug-Model": result.debug?.model || "unknown",
        "X-Genie-Sources": JSON.stringify(result.sources || []),
      },
    });
  } catch (error: any) {
    console.error("[CONVERSATION_API_ERROR]", error);

    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;

    const errorMessage = error.message || "An unknown error occurred";
    void trackAIError({ tool: 'chat', errorType: 'unknown', errorMessage, userId: 'unknown' });
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
