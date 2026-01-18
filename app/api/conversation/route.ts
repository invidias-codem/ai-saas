// app/api/conversation/route.ts
import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  ConversationRequestSchema,
  generateConversationReply,
} from "@/lib/llm/conversationEngine";

export async function POST(req: Request) {
  try {
    // ✅ Get authenticated user from Clerk
    const { userId } = auth();
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // ✅ Get full Clerk user object for context
    const clerkUser = await currentUser();
    if (!clerkUser) {
      return new NextResponse("User not found", { status: 401 });
    }

    const body = await req.json();

    const validationResult = ConversationRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return new NextResponse(
        JSON.stringify({
          error: "Validation Error",
          details: validationResult.error.flatten(),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const result = await generateConversationReply(
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

    return NextResponse.json({ text: result.text });
  } catch (error: any) {
    console.error("[CONVERSATION_API_ERROR]", error);
    const errorMessage = error.message || "An unknown error occurred";
    return new NextResponse(
      JSON.stringify({
        error: "Internal Server Error",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
