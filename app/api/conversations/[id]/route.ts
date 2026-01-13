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

interface DbMessage {
    id: string;
    content: string;
    role: string;
    created_at: string;
    conversation_id: string;
    user_id: string;
}

/**
 * GET - Load full conversation with all messages
 */
// GET - Load full conversation
export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = params;
        if (!id) return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Fetch conversation metadata
        const { data: conv, error: convError } = await supabase
            .from("conversations")
            .select("*")
            .eq("id", id)
            .single();

        if (convError || !conv) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Check ownership (RLS handles this usually, but good to be explicit if using service key or just safe)
        if (conv.user_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Soft delete check
        if (conv.is_deleted) {
            return NextResponse.json({ error: "Conversation not found (deleted)" }, { status: 404 });
        }

        // Fetch messages
        const { data: messages, error: msgError } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", id)
            .order("created_at", { ascending: true });

        if (msgError) {
            console.error("Error fetching messages:", msgError);
            // Return empty messages if error
        }

        return NextResponse.json({
            id: conv.id,
            title: conv.title,
            messages: messages?.map((m: DbMessage) => ({
                text: m.content,
                role: m.role,
                timestamp: new Date(m.created_at).getTime()
            })) || [],
            createdAt: new Date(conv.created_at).getTime(),
            lastUpdated: new Date(conv.updated_at).getTime(),
            isArchived: conv.is_archived
        });
    } catch (error) {
        console.error("[API:Conversation:GET] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE - Delete a conversation
 */
// DELETE - Soft delete a conversation
export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = params;
        if (!id) return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });

        if (id === "merged") {
            return NextResponse.json({ error: "Cannot delete default conversation" }, { status: 400 });
        }

        const { supabase } = await import("@/lib/supabaseClient");

        // Verify existence and ownership
        const { data: conv, error: checkError } = await supabase
            .from("conversations")
            .select("user_id")
            .eq("id", id)
            .single();

        if (checkError || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        if (conv.user_id !== userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

        // Perform Soft Delete with 30-day recovery window
        const { error: updateError } = await supabase
            .from("conversations")
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString() // Start 30-day countdown
            })
            .eq("id", id);

        if (updateError) {
            console.error("Error deleting conversation:", updateError);
            throw new Error("Failed to delete");
        }

        console.log(`[API:Conversation:DELETE] Soft-deleted conversation ${id}`);

        return NextResponse.json({ success: true, deletedId: id });
    } catch (error) {
        console.error("[API:Conversation:DELETE] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * PATCH - Update conversation (title, archive status, restore)
 */
// PATCH - Update conversation
export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = params;
        if (!id) return NextResponse.json({ error: "Conversation ID required" }, { status: 400 });

        const body = await req.json();
        const { title, isArchived, restore, permanentDelete } = body;
        const updates: any = {};

        if (title !== undefined) updates.title = title.substring(0, 100);
        if (isArchived !== undefined) updates.is_archived = isArchived;

        // Restore a deleted conversation
        if (restore === true) {
            updates.is_deleted = false;
            console.log(`[API:Conversation:PATCH] Restoring conversation ${id}`);
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ success: true, id }); // Nothing to update
        }

        const { supabase } = await import("@/lib/supabaseClient");

        // Verify ownership first (optional if using RLS, but standard practice in backend)
        const { data: conv, error: checkError } = await supabase.from("conversations").select("user_id").eq("id", id).single();
        if (checkError || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        if (conv.user_id !== userId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

        const { error: updateError } = await supabase
            .from("conversations")
            .update(updates)
            .eq("id", id);

        if (updateError) {
            console.error("Error updating conversation:", updateError);
            throw new Error("Failed to update");
        }

        return NextResponse.json({ success: true, id, ...updates });
    } catch (error) {
        console.error("[API:Conversation:PATCH] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
