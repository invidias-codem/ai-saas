/**
 * Create New Conversation API Route
 * 
 * POST /api/conversations/new
 * Creates a new empty conversation and returns its ID
 */

import { NextResponse } from "next/server";
import { requireAuth, AuthenticationError, AuthorizationError, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { z } from 'zod';

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        // Rate limiting
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'mutation');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        // Parse optional body for initial title, workspace, and operating profile
        let initialTitle = "New Conversation";
        let workspaceId: string | null = null;
        let operatingProfileId: string | null = null;
        try {
            const body = await req.json();
            if (body.title) {
                const titleSchema = z.string().min(1).max(100);
                const validatedTitle = titleSchema.parse(body.title);
                initialTitle = validatedTitle;
            }
            if (typeof body.workspaceId === 'string' && body.workspaceId.trim()) {
                workspaceId = body.workspaceId.trim();
            }
            if (typeof body.operatingProfileId === 'string' && body.operatingProfileId.trim()) {
                operatingProfileId = body.operatingProfileId.trim();
            }
        } catch (error) {
            if (error instanceof z.ZodError) {
                return NextResponse.json({ error: "Invalid title length" }, { status: 400 });
            }
            // No body or invalid JSON is fine, use default title
        }

        // Use supabaseAdmin to bypass RLS since we manage auth with Clerk
        const { supabaseAdmin } = await import("@/lib/supabaseClient");

        if (!supabaseAdmin) {
            console.error("Supabase client not initialized. Missing environment variables.");
            return NextResponse.json({ error: "Database configuration missing" }, { status: 500 });
        }

        // Preserve legacy null associations; explicitly requested resources must
        // be owned by the caller. Shared conversation creation is a separate
        // policy decision; do not widen the existing owner-only routing model.
        if (workspaceId) {
            const { data: workspace, error: workspaceError } = await supabaseAdmin
                .from('workspaces').select('id').eq('id', workspaceId)
                .eq('user_id', user.userId).maybeSingle();
            if (workspaceError) throw workspaceError;
            if (!workspace) return NextResponse.json({ error: 'Workspace not found or not accessible' }, { status: 404 });
        }
        if (operatingProfileId) {
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('operating_profiles').select('id').eq('id', operatingProfileId)
                .eq('user_id', user.userId).maybeSingle();
            if (profileError) throw profileError;
            if (!profile) return NextResponse.json({ error: 'Operating profile not found or not accessible' }, { status: 404 });
        }

        const { data, error } = await supabaseAdmin
            .from("conversations")
            .insert({
                user_id: user.userId,
                workspace_id: workspaceId,
                operating_profile_id: operatingProfileId,
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

        console.log(`[API:Conversation:New] Created conversation ${data.id} for user ${user.userId.substring(0, 8)}`);

        return NextResponse.json({
            success: true,
            conversationId: data.id,
            title: data.title,
            createdAt: new Date(data.created_at).getTime(),
        });
    } catch (error) {
        console.error("[API:Conversation:New] Error:", error);

        if (error instanceof AuthenticationError || error instanceof AuthorizationError) return handleAuthError(error);

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
