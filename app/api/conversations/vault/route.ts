/**
 * Vault API Route
 * 
 * GET /api/conversations/vault?filter=all|active|archived|deleted
 * Returns ALL conversations including deleted ones for the Vault view
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export interface VaultConversation {
    id: string;
    title: string;
    messageCount: number;
    createdAt: number;
    lastUpdated: number;
    isArchived: boolean;
    isDeleted: boolean;
    preview?: string;
    deletedAt?: number;      // Timestamp when soft deleted
    daysUntilPurge?: number; // Days remaining before permanent deletion
}

export async function GET(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const { searchParams } = new URL(req.url);
        const filter = searchParams.get('filter') || 'all';

        // Validate filter parameter
        const filterSchema = z.enum(['all', 'active', 'archived', 'deleted']);
        const filterValidation = filterSchema.safeParse(filter);
        if (!filterValidation.success) {
            return NextResponse.json({ error: 'Invalid filter parameter' }, { status: 400 });
        }

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Build query based on filter
        let query = supabase
            .from("conversations")
            .select(`
                *,
                messages (
                    content,
                    created_at,
                    role
                )
            `)
            .eq("user_id", user.userId)
            .order("updated_at", { ascending: false });

        // Apply filter
        switch (filter) {
            case 'active':
                query = query.eq("is_deleted", false).eq("is_archived", false);
                break;
            case 'archived':
                query = query.eq("is_deleted", false).eq("is_archived", true);
                break;
            case 'deleted':
                query = query.eq("is_deleted", true);
                break;
            // 'all' - no additional filters
        }

        const { data: conversations, error } = await query.limit(100);

        if (error) {
            console.error("[API:Vault] Supabase Error:", error);
            throw new Error("Failed to fetch conversations");
        }

        // Fetch message counts separately for accuracy
        const conversationIds = conversations.map((c: any) => c.id);

        let messageCounts: Record<string, number> = {};
        if (conversationIds.length > 0) {
            // Get message counts for all conversations at once
            const { data: countData } = await supabase
                .from("messages")
                .select("conversation_id")
                .in("conversation_id", conversationIds);

            // Count messages per conversation
            if (countData) {
                for (const msg of countData) {
                    messageCounts[msg.conversation_id] = (messageCounts[msg.conversation_id] || 0) + 1;
                }
            }
        }

        const mappedConversations: VaultConversation[] = conversations.map((c: any) => {
            const msgs = (c.messages || []).sort((a: any, b: any) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            let preview = lastMsg?.content?.substring(0, 100) || '';
            if (lastMsg?.content?.length > 100) preview += "...";

            // Use direct count if available, fallback to joined messages length
            const count = messageCounts[c.id] || msgs.length;

            // Calculate days until permanent deletion (30-day window)
            let daysUntilPurge: number | undefined;
            let deletedAt: number | undefined;
            if (c.is_deleted && c.deleted_at) {
                deletedAt = new Date(c.deleted_at).getTime();
                const daysSinceDelete = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
                daysUntilPurge = Math.max(0, 30 - daysSinceDelete);
            }

            return {
                id: c.id,
                title: c.title,
                messageCount: count,
                createdAt: new Date(c.created_at).getTime(),
                lastUpdated: new Date(c.updated_at).getTime(),
                isArchived: c.is_archived || false,
                isDeleted: c.is_deleted || false,
                preview,
                deletedAt,
                daysUntilPurge
            };
        });

        // Calculate counts for each category
        const counts = {
            all: mappedConversations.length,
            active: mappedConversations.filter(c => !c.isDeleted && !c.isArchived).length,
            archived: mappedConversations.filter(c => !c.isDeleted && c.isArchived).length,
            deleted: mappedConversations.filter(c => c.isDeleted).length,
        };

        return NextResponse.json({
            conversations: mappedConversations,
            counts,
            filter
        });

    } catch (error) {
        console.error("[API:Vault] Error:", error);

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
