/**
 * Memory Scope Toggle API
 * 
 * POST /api/memory/scope
 * Toggles a memory between conversation-scoped and global
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireAuth, requireOwnership, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { uuidSchema } from '@/lib/security/inputValidation';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const body = await req.json();
        const { memoryId, scope } = body;

        // Validate inputs
        const memoryIdValidation = uuidSchema.safeParse(memoryId);
        if (!memoryIdValidation.success) {
            return NextResponse.json(
                { error: "Invalid memory ID format" },
                { status: 400 }
            );
        }

        const scopeSchema = z.enum(['conversation', 'persistent']);
        const scopeValidation = scopeSchema.safeParse(scope);
        if (!scopeValidation.success) {
            return NextResponse.json(
                { error: "scope must be 'conversation' or 'persistent'" },
                { status: 400 }
            );
        }

        const { supabase } = await import("@/lib/supabaseClient");

        if (!supabase) {
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Verify ownership using centralized utility
        await requireOwnership(user.userId, memoryId, 'memory_bank');

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

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
