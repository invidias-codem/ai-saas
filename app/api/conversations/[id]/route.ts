/**
 * Single Conversation API Route
 * 
 * GET /api/conversations/{id} - Load full conversation
 * DELETE /api/conversations/{id} - Delete conversation
 * PATCH /api/conversations/{id} - Update title/archive status
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

interface RouteParams {
    params: { id: string };
}

/**
 * GET - Load full conversation with all messages
 */
export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = params;

        if (!id) {
            return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });
        }

        const conversationRef = db
            .collection("users")
            .doc(userId)
            .collection("conversations")
            .doc(id);

        const doc = await conversationRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        const data = doc.data();

        return NextResponse.json({
            id: doc.id,
            title: data?.title || "Untitled Conversation",
            messages: data?.messages || [],
            createdAt: data?.createdAt?.toMillis?.() || data?.createdAt || Date.now(),
            lastUpdated: data?.lastUpdated?.toMillis?.() || data?.lastUpdated || Date.now(),
            isArchived: data?.isArchived || false,
        });
    } catch (error) {
        console.error("[API:Conversation:GET] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * DELETE - Delete a conversation
 */
export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = params;

        if (!id) {
            return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });
        }

        // Don't allow deleting the "merged" fallback conversation
        if (id === "merged") {
            return NextResponse.json(
                { error: "Cannot delete the default conversation. Use 'Clear' instead." },
                { status: 400 }
            );
        }

        const conversationRef = db
            .collection("users")
            .doc(userId)
            .collection("conversations")
            .doc(id);

        const doc = await conversationRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Delete the conversation
        await conversationRef.delete();

        console.log(`[API:Conversation:DELETE] Deleted conversation ${id} for user ${userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            deletedId: id,
        });
    } catch (error) {
        console.error("[API:Conversation:DELETE] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * PATCH - Update conversation (title, archive status)
 */
export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = params;

        if (!id) {
            return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });
        }

        const body = await req.json();
        const { title, isArchived } = body;

        const conversationRef = db
            .collection("users")
            .doc(userId)
            .collection("conversations")
            .doc(id);

        const doc = await conversationRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Build update object
        const updates: Record<string, any> = {
            lastUpdated: new Date(),
        };

        if (title !== undefined) {
            updates.title = title.substring(0, 100); // Limit title length
        }

        if (isArchived !== undefined) {
            updates.isArchived = Boolean(isArchived);
        }

        await conversationRef.update(updates);

        console.log(`[API:Conversation:PATCH] Updated conversation ${id} for user ${userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            id,
            ...updates,
        });
    } catch (error) {
        console.error("[API:Conversation:PATCH] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
