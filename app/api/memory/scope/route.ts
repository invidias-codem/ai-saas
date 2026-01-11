/**
 * Memory Scope Toggle API
 * 
 * POST /api/memory/scope
 * Toggles a memory between conversation-scoped and global
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { memoryId, scope } = body;

        if (!memoryId || !scope) {
            return NextResponse.json(
                { error: "memoryId and scope are required" },
                { status: 400 }
            );
        }

        // Validate scope
        if (!['conversation', 'persistent'].includes(scope)) {
            return NextResponse.json(
                { error: "scope must be 'conversation' or 'persistent'" },
                { status: 400 }
            );
        }

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Verify the memory belongs to this user
        const { data: memory, error: fetchError } = await supabase
            .from('memory_bank')
            .select('user_id')
            .eq('id', memoryId)
            .single();

        if (fetchError || !memory) {
            return NextResponse.json({ error: "Memory not found" }, { status: 404 });
        }

        if (memory.user_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // Update the scope
        const { error: updateError } = await supabase
            .from('memory_bank')
            .update({ scope })
            .eq('id', memoryId);

        if (updateError) {
            console.error('[Memory:Scope] Error updating scope:', updateError);
            return NextResponse.json({ error: "Failed to update scope" }, { status: 500 });
        }

        console.log(`[Memory:Scope] Updated memory ${memoryId} to scope: ${scope}`);

        return NextResponse.json({
            success: true,
            memoryId,
            scope
        });

    } catch (error) {
        console.error('[Memory:Scope] Error:', error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
