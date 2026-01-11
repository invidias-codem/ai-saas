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

// GET - List all conversations
export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            console.error("Supabase client not initialized. Missing environment variables.");
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Fetch conversations
        // IMPORTANT: We need message count and preview.
        // Supabase doesn't have a direct "include messages" count unless we use a view or a separate query.
        // For efficiency, we can query conversations first, then maybe messages or rely on the UI to load details.
        // However, the interface demands messageCount and preview.
        // To do this efficiently in one go without a complex join might be tricky if we don't have a summary table.
        // For now, let's just fetch conversations and maybe the last message.
        // Or, we can do a robust query if we had a join.
        // A simple approach is: Select conversations, order by updated_at.
        // For preview/message counting, we might need a separate function store it on the conversation record itself during updates.
        // BUT, adhering to the current schema (conversations + messages tables), we might have to do N+1 or a join.
        // Let's try to grab conversations.

        const { data: conversations, error } = await supabase
            .from("conversations")
            .select(`
                *,
                messages (
                    content,
                    created_at,
                    role
                )
            `)
            .eq("user_id", userId)
            .eq("is_deleted", false)
            .order("updated_at", { ascending: false })
            .limit(50);

        if (error) {
            console.error("[API:Conversations] Supabase Error:", error);
            throw new Error("Failed to fetch conversations");
        }

        const mappedConversations: ConversationMeta[] = conversations.map((c: any) => {
            // In Supabase, if we joined, messages might be an array.
            // We need to sort them client-side or use a better query if possible.
            // Default sort order in join: usually unspecified unless we add .order() to the join, which supabase-js supports.
            // Let's assume we get them and sort them by created_at here to be safe for preview generation.
            const msgs = (c.messages || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            let preview = lastMsg?.content.substring(0, 100);
            if (lastMsg?.content.length > 100) preview += "...";

            return {
                id: c.id,
                title: c.title,
                messageCount: msgs.length,
                createdAt: new Date(c.created_at).getTime(),
                lastUpdated: new Date(c.updated_at).getTime(),
                isArchived: c.is_archived,
                preview
            };
        });

        return NextResponse.json({
            conversations: mappedConversations,
            total: mappedConversations.length,
        });

    } catch (error) {
        console.error("[API:Conversations] Error fetching conversations:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
