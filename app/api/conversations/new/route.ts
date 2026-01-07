/**
 * Create New Conversation API Route
 * 
 * POST /api/conversations/new
 * Creates a new empty conversation and returns its ID
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Parse optional body for initial title
        let initialTitle = "New Conversation";
        try {
            const body = await req.json();
            if (body.title) {
                initialTitle = body.title.substring(0, 100);
            }
        } catch {
            // No body is fine, use default title
        }

        // Generate unique conversation ID
        const conversationId = `conv_${Date.now()}_${uuidv4().substring(0, 8)}`;
        const now = new Date();

        // Create the conversation document
        const conversationRef = db
            .collection("users")
            .doc(userId)
            .collection("conversations")
            .doc(conversationId);

        await conversationRef.set({
            title: initialTitle,
            messages: [],
            createdAt: now,
            lastUpdated: now,
            isArchived: false,
            createdBy: "user", // vs "system" for auto-created
            version: 1,
        });

        console.log(`[API:Conversation:New] Created conversation ${conversationId} for user ${userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            conversationId,
            title: initialTitle,
            createdAt: now.getTime(),
        });
    } catch (error) {
        console.error("[API:Conversation:New] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
