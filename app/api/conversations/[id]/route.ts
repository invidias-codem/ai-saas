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
import { requireAuth, requireOwnership, handleAuthError, getClientIP } from "@/lib/security/apiAuth";
import { limitApiEndpoint } from "@/lib/security/rateLimit";
import { conversationIdSchema, ValidationError } from "@/lib/security/inputValidation";

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

interface RouteParams {
    params: Promise<{ id: string }>;
}

interface DbMessage {
    id: string;
    content: string;
    role: string;
    created_at: string;
    conversation_id: string;
    user_id: string;
    metadata?: Record<string, any> | null;
}

export async function GET(req: Request, { params }: RouteParams) {
    try {
        const { id: paramId } = await params;
        // Authentication
        const user = await requireAuth();
        const ip = getClientIP(req);

        // Rate limiting
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
        if (!rateLimit.success) {
            return NextResponse.json(
                { error: 'Too many requests', retryAfter: Math.ceil((rateLimit.reset - Date.now()) / 1000) },
                { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)) } }
            );
        }

        // Input validation
        const validationResult = conversationIdSchema.safeParse(paramId);
        if (!validationResult.success) {
            return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 });
        }
        const id = validationResult.data;

        // ... rest of function ...


        const { supabaseAdmin } = await import("@/lib/supabaseClient");

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Fetch conversation metadata
        const { data: conv, error: convError } = await supabaseAdmin
            .from("conversations")
            .select("*")
            .eq("id", id)
            .single();

        if (convError || !conv) {
            return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        }

        // Check ownership using centralized utility
        await requireOwnership(user.userId, id, 'conversations');

        // Soft delete check
        if (conv.is_deleted) {
            return NextResponse.json({ error: "Conversation not found (deleted)" }, { status: 404 });
        }

        // Fetch messages
        const { data: messages, error: msgError } = await supabaseAdmin
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
            workspaceId: conv.workspace_id ?? null,
            title: conv.title,
            messages: messages?.map((m: DbMessage) => ({
                id: m.id,
                text: m.content,
                role: m.role,
                timestamp: new Date(m.created_at).getTime(),
                fileData: m.metadata?.fileData ?? undefined
            })) || [],
            createdAt: new Date(conv.created_at).getTime(),
            lastUpdated: new Date(conv.updated_at).getTime(),
            isArchived: conv.is_archived
        });
    } catch (error) {
        console.error("[API:Conversation:GET] Error:", error);

        // Handle auth errors with centralized handler
        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * DELETE - Delete a conversation
 */
// DELETE - Soft delete a conversation
export async function DELETE(req: Request, { params }: RouteParams) {
    try {
        const { id: paramId } = await params;
        // Authentication & rate limiting
        const user = await requireAuth();
        const ip = getClientIP(req);
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
        if (!rateLimit.success) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429 }
            );
        }

        // Input validation
        const validationResult = conversationIdSchema.safeParse(paramId);
        if (!validationResult.success) {
            return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 });
        }
        const id = validationResult.data;

        if (id === "merged") {
            return NextResponse.json({ error: "Cannot delete default conversation" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/lib/supabaseClient");

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Verify existence and ownership
        const { data: conv, error: checkError } = await supabaseAdmin
            .from("conversations")
            .select("user_id")
            .eq("id", id)
            .single();

        if (checkError || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        await requireOwnership(user.userId, id, 'conversations');

        // Perform Soft Delete with 30-day recovery window
        const { error: updateError } = await supabaseAdmin
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
        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/**
 * PATCH - Update conversation (title, archive status, restore)
 */
// PATCH - Update conversation
export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { id: paramId } = await params;
        // Authentication & rate limiting
        const user = await requireAuth();
        const ip = getClientIP(req);
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        // Input validation
        const validationResult = conversationIdSchema.safeParse(paramId);
        if (!validationResult.success) {
            return NextResponse.json({ error: "Invalid conversation ID format" }, { status: 400 });
        }
        const id = validationResult.data;

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

        const { supabaseAdmin } = await import("@/lib/supabaseClient");

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Verify ownership first (optional if using RLS, but standard practice in backend)
        const { data: conv, error: checkError } = await supabaseAdmin.from("conversations").select("user_id").eq("id", id).single();
        if (checkError || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
        await requireOwnership(user.userId, id, 'conversations');

        const { error: updateError } = await supabaseAdmin
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
        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
