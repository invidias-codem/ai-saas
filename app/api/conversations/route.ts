/**
 * Conversations API Route
 * 
 * GET /api/conversations
 * Returns list of all conversations for the current user (metadata only)
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

export interface ConversationMeta {
    id: string;
    title: string;
    messageCount: number;
    createdAt: number;
    lastUpdated: number;
    isArchived: boolean;
    preview?: string; // First ~50 chars of last message
}

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const conversationsRef = db.collection("users").doc(userId).collection("conversations");
        const snapshot = await conversationsRef
            .orderBy("lastUpdated", "desc")
            .limit(50) // Limit to last 50 conversations
            .get();

        if (snapshot.empty) {
            return NextResponse.json({
                conversations: [],
                total: 0,
            });
        }

        const conversations: ConversationMeta[] = [];

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const messages = data.messages || [];

            // Generate title from first user message if not set
            let title = data.title;
            if (!title) {
                const firstUserMessage = messages.find((m: any) => m.role === "user");
                if (firstUserMessage) {
                    title = firstUserMessage.text?.substring(0, 50) || "New Conversation";
                    if (firstUserMessage.text?.length > 50) {
                        title += "...";
                    }
                } else {
                    title = "New Conversation";
                }
            }

            // Get preview from last message
            let preview: string | undefined;
            if (messages.length > 0) {
                const lastMessage = messages[messages.length - 1];
                preview = lastMessage.text?.substring(0, 100);
                if (lastMessage.text?.length > 100) {
                    preview += "...";
                }
            }

            conversations.push({
                id: doc.id,
                title,
                messageCount: messages.length || 0,
                createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
                lastUpdated: data.lastUpdated?.toMillis?.() || data.lastUpdated || Date.now(),
                isArchived: data.isArchived || false,
                preview,
            });
        });

        return NextResponse.json({
            conversations,
            total: conversations.length,
        });
    } catch (error) {
        console.error("[API:Conversations] Error fetching conversations:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
