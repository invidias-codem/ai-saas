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

        // Import Supabase client dynamically to avoid circular deps if any
        // Use supabaseAdmin to bypass RLS since we manage auth with Clerk
        const { supabaseAdmin } = await import("@/lib/supabaseClient");

        if (!supabaseAdmin) {
            console.error("Supabase client not initialized. Missing environment variables.");
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .insert({
                user_id: userId,
                title: initialTitle,
                is_deleted: false,
                is_archived: false,
            })
            .select()
            .single();

        if (error) {
            console.error("[API:Conversation:New] Supabase Error:", error);
            throw new Error("Failed to create conversation");
        }

        console.log(`[API:Conversation:New] Created conversation ${data.id} for user ${userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            conversationId: data.id,
            title: data.title,
            createdAt: new Date(data.created_at).getTime(),
        });
    } catch (error) {
        console.error("[API:Conversation:New] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
