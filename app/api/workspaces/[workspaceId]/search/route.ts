import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { PremiumRequiredError } from "@/lib/ai/auth";

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = await params;
  try {
        const { userId } = await auth();
        
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaceId = params.workspaceId;
        const body = await req.json();
        const { repo_full_name, query, match_count = 10 } = body;

        if (!repo_full_name || !query) {
            return NextResponse.json({ error: "Invalid payload: missing repo_full_name or query" }, { status: 400 });
        }

        if (!supabaseAdmin) {
            throw new Error("Supabase Admin client not initialized");
        }

        // Verify that the user has access to this workspace
        const { data: workspaceData, error: workspaceError } = await supabaseAdmin
            .from('workspaces')
            .select('id')
            .eq('id', workspaceId)
            .eq('user_id', userId)
            .single();

        if (workspaceError || !workspaceData) {
            console.error("[Search Route] Workspace access error:", workspaceError);
            return NextResponse.json({ error: "Forbidden: You do not have access to this workspace" }, { status: 403 });
        }

        // Generate vector embedding for the search query
        const queryEmbedding = await generateEmbedding(query, userId);

        // Execute Supabase RPC vector match
        // We set match_threshold very low (0.0) initially to ensure we get results for code queries
        const { data: matches, error: rpcError } = await supabaseAdmin.rpc('match_code_embeddings', {
            query_embedding: queryEmbedding,
            match_threshold: 0.0,
            match_count: match_count,
            filter_repo: repo_full_name,
            filter_workspace_id: workspaceId
        });

        if (rpcError) {
            console.error("[Search Route] Supabase RPC error:", rpcError);
            throw new Error("Failed to execute vector search");
        }

        return NextResponse.json({ success: true, matches });
    } catch (error) {
        if (error instanceof PremiumRequiredError) {
            return NextResponse.json({ error: "PREMIUM_REQUIRED" }, { status: 402 });
        }
        console.error("[Search Route] Fatal Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
