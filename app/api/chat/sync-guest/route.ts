import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { z } from 'zod';
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = 'force-dynamic';

const syncGuestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "bot"]),
        text: z.string()
    })).min(1, "At least one message is required"),
    guestSessionId: z.string()
});

export async function POST(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        // Rate limiting
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const body = await req.json();
        const validationResult = syncGuestSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({
                error: "Validation Error",
                details: validationResult.error.flatten()
            }, { status: 400 });
        }

        const { messages, guestSessionId } = validationResult.data;

        if (!supabaseAdmin) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Check if session already synced
        const { data: existing } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("metadata->>guestSessionId", guestSessionId)
            .single();

        if (existing) {
            return NextResponse.json({
                success: true,
                conversationId: existing.id
            });
        }

        const { data: convData, error: convError } = await supabaseAdmin
            .from("conversations")
            .insert({
                user_id: user.userId,
                title: "Guest Chat Session",
                is_deleted: false,
                is_archived: false,
                metadata: { guestSessionId }
            })
            .select()
            .single();

        if (convError) {
            throw new Error("Failed to create conversation");
        }

        const conversationId = convData.id;

        // Insert messages
        const insertMessages = messages.map((msg) => ({
            conversation_id: conversationId,
            role: msg.role,
            content: msg.text,
            metadata: { featureType: 'guest-sync' },
        }));

        const { error: msgError } = await supabaseAdmin
            .from('messages')
            .insert(insertMessages);

        if (msgError) {
            console.error("[API:Chat:SyncGuest] Error inserting messages:", msgError);
            throw new Error("Failed to insert synced messages");
        }

        return NextResponse.json({
            success: true,
            conversationId
        });
    } catch (error) {
        console.error("[API:Chat:SyncGuest] Error:", error);

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
