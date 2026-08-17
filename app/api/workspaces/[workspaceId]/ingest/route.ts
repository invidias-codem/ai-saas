import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { PremiumRequiredError } from "@/lib/ai/auth";

export const dynamic = 'force-dynamic';
// Vercel max duration limit mapping if needed
export const maxDuration = 60; // 60 seconds (up to 300 on Pro, but batching makes 60 safe)

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = await params;
  try {
        const { userId } = await auth();
        
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const workspaceId = params.workspaceId;
        const body = await req.json();
        const { repo_full_name, chunks } = body;

        if (!repo_full_name || !chunks || !Array.isArray(chunks)) {
            return NextResponse.json({ error: "Invalid payload: missing repo_full_name or chunks array" }, { status: 400 });
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
            console.error("[Ingest Route] Workspace access error:", workspaceError);
            return NextResponse.json({ error: "Forbidden: You do not have access to this workspace" }, { status: 403 });
        }

        // Process chunks in controlled batches to prevent OpenAI rate limits
        const batchSize = 10;
        const processedVectors = [];
        
        for (let i = 0; i < chunks.length; i += batchSize) {
            const currentBatch = chunks.slice(i, i + batchSize);
            const embeddings = await Promise.all(
                currentBatch.map(async (c: any) => {
                    const vector = await generateEmbedding(c.content_chunk, userId);
                    return {
                        workspace_id: workspaceId,
                        repo_full_name: repo_full_name,
                        file_path: c.file_path,
                        content_chunk: c.content_chunk,
                        embedding: vector,
                    };
                })
            );
            processedVectors.push(...embeddings);
        }

        // Bulk insert into Supabase pgvector
        if (processedVectors.length > 0) {
            const { error: insertError } = await supabaseAdmin
                .from('github_embeddings')
                .insert(processedVectors);

            if (insertError) {
                console.error("[Ingest Route] Supabase bulk insert error:", insertError);
                throw new Error("Failed to insert embeddings into database");
            }
        }

        return NextResponse.json({ success: true, inserted: processedVectors.length });
    } catch (error) {
        if (error instanceof PremiumRequiredError) {
            return NextResponse.json({ error: "PREMIUM_REQUIRED" }, { status: 402 });
        }
        console.error("[Ingest Route] Fatal Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
