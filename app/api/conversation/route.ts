// app/api/conversation/route.ts
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { trackAIGeneration, trackAIError, trackCreditsDeducted } from "@/lib/analytics/track";

import {
  ConversationRequestSchema,
  generateConversationReply,
} from "@/lib/llm/conversationEngine";
import { spendCreditsAtomic, refundCredits, CREDIT_COSTS } from "@/lib/credits";
import { withProtectedRoute } from "@/lib/core-api/protectedRoute";
import { checkTokenBudget, recordTokenUsage } from "@/lib/security/budgetGuard";
import { estimateTokenCount } from "@/lib/ragMemory";
import { audit } from "@/lib/security/auditLog";
import { logger } from "@/lib/logger";
import { emitConversationMemoryEvent, buildConversationEventContext, conversationModelDecision, memoriesToToolInvocations } from "@/lib/memory/memoryEvents";

export async function POST(req: Request) {
  return withProtectedRoute(
    req,
    async (ctx) => {
      try {
        const clerkUser = await currentUser();
        if (!clerkUser) {
          console.error("[Conversation API] Auth passed but currentUser failed");
          return NextResponse.json(
            { error: "Unauthorized", message: "User profile not found." },
            { status: 401 }
          );
        }

        const userId = ctx.user.userId;
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

        const userQuery = validationResult.data.messages.at(-1)?.text ?? "";
        const estimatedTokens = estimateTokenCount(userQuery) + 2048;
        const budgetCheck = await checkTokenBudget(userId, estimatedTokens);

        if (!budgetCheck.allowed) {
          void audit(
            "chat.budget_exceeded",
            userId,
            {
              tier: budgetCheck.tier,
              used: budgetCheck.tokensUsedThisMonth,
              budget: budgetCheck.tokenBudget,
            },
            req
          );
          return NextResponse.json(
            { error: "Token Budget Exceeded", message: budgetCheck.reason },
            { status: 402 }
          );
        }

        void audit("chat.request", userId, { estimatedTokens, tier: budgetCheck.tier }, req);

        const cost = CREDIT_COSTS.CHAT_MESSAGE;
        const spendResult = await spendCreditsAtomic(userId, cost, ctx.idempotencyKey, "Chat message");

        if (!spendResult.success && !spendResult.duplicate) {
          return NextResponse.json(
            {
              error: "Insufficient credits",
              message: `You need ${cost} credits for this request.`,
              remaining: spendResult.remaining,
            },
            { status: 402 }
          );
        }

        const conversationStart = Date.now();
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
          if (!spendResult.duplicate) {
            logger.info(`[Conversation API] Generation failed, refunding ${cost} credits to ${userId}`);
            await refundCredits(userId, cost, "Refund for failed chat generation");
          }
          emitConversationMemoryEvent({
            userId,
            workspaceId: validationResult.data.workspaceId ?? null,
            source: "genie",
            promptText: userQuery,
            resultSummary: error instanceof Error ? error.message : "Generation failed",
            tokensIn: estimatedTokens,
            tokensOut: 0,
            model: { modelId: result?.debug?.model ?? "unknown", provider: "unknown", fallbackUsed: false },
            startTime: conversationStart,
          });
          throw error;
        }

        const modelUsed = result.debug?.model ?? "gemini-2.5-flash";
        void recordTokenUsage(userId, estimatedTokens, modelUsed);
        void trackAIGeneration({ tool: "chat", model: modelUsed, userId, tokenCount: estimatedTokens, success: true });
        void trackCreditsDeducted({ tool: "chat", credits: cost, userId });

        const [clientStream, captureStream] = result.stream.tee();

        void (async () => {
          try {
            const text = await extractStreamingText(captureStream);
            emitConversationMemoryEvent({
              userId,
              workspaceId: validationResult.data.workspaceId ?? null,
              source: "genie",
              promptText: userQuery,
              resultSummary: text.slice(-200),
              tokensIn: estimatedTokens,
              tokensOut: Math.max(0, text.length - estimatedTokens),
              model: { modelId: modelUsed, provider: "unknown", fallbackUsed: false },
              startTime: conversationStart,
            });
          } catch (err: any) {
            logger.error("[Conversation API] Memory capture failed", { error: err?.message || String(err) });
          }
        })();

        return new NextResponse(clientStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Debug-Model": result.debug?.model || "unknown",
            "X-Genie-Sources": JSON.stringify(result.sources || []),
          },
        });
      } catch (error: any) {
        console.error("[CONVERSATION_API_ERROR]", error);

        const errorMessage = error.message || "An unknown error occurred";
        void trackAIError({ tool: "chat", errorType: "unknown", errorMessage, userId: "unknown" });
        return NextResponse.json(
          {
            error: "Internal Server Error",
            details: errorMessage,
          },
          { status: 500 }
        );
      }
    },
    { idempotencyPrefix: "chat" }
  );
}

function extractStreamingText(stream: ReadableStream): Promise<string> {
  const chunks: string[] = [];
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (typeof value === 'string') {
        chunks.push(value);
      } else if (value) {
        chunks.push(decoder.decode(value, { stream: true }));
      }
    }
  } catch {
    // Best-effort text extraction only; never block response delivery on metadata capture.
  }

  return chunks.join("").replace(/<thought>[\s\S]*?<\/thought>/g, "").trim();
}
