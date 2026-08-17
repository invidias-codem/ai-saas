// app/api/workspaces/[workspaceId]/sources/query/route.ts
// Semantic retrieval over a workspace's CURRENT sources (valid_until IS NULL).
// Used by Weaver's UCOL context injection and by the "Data Source" UI modal.
//
// Body: { "query": string, "match_count"?: int, "match_threshold"?: float,
//         "source_types"?: string[] }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { PremiumRequiredError } from '@/lib/ai/auth';
import { SOURCE_TYPES } from '@/lib/ai/sourceIngest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const QuerySchema = z.object({
    query: z.string().min(1).max(4000),
    match_count: z.number().int().min(1).max(50).optional(),
    match_threshold: z.number().min(0).max(1).optional(),
    source_types: z.array(z.enum(SOURCE_TYPES)).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
  const { workspaceId } = await params;
  try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workspaceId } = params;
        const body = await req.json().catch(() => ({}));
        const validation = QuerySchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: validation.error.flatten() },
                { status: 400 }
            );
        }
        const { query, match_count, match_threshold, source_types } = validation.data;

        if (!supabaseAdmin) {
            throw new Error('Supabase Admin client not initialized');
        }

        // Access check
        const { data: workspaceData, error: workspaceError } = await supabaseAdmin
            .from('workspaces')
            .select('id')
            .eq('id', workspaceId)
            .eq('user_id', userId)
            .single();
        if (workspaceError || !workspaceData) {
            return NextResponse.json(
                { error: 'Forbidden: You do not have access to this workspace' },
                { status: 403 }
            );
        }

        const queryEmbedding = await generateEmbedding(query, userId);

        const { data, error } = await supabaseAdmin.rpc('match_workspace_sources', {
            query_embedding: queryEmbedding,
            target_workspace_id: workspaceId,
            match_threshold: match_threshold ?? 0.7,
            match_count: match_count ?? 12,
            filter_source_types: source_types ?? null,
        });

        if (error) {
            console.error('[Sources:Query] RPC error:', error);
            return NextResponse.json(
                { error: 'Source query failed', details: error.message },
                { status: 500 }
            );
        }

        // Surface provenance so the UI can show "where Weaver pulled this from".
        const results = (data || []).map((row: any) => ({
            id: row.id,
            source_type: row.source_type,
            title: row.title,
            origin_uri: row.origin_uri,
            content: row.content,
            metadata: row.metadata,
            similarity: row.similarity,
            created_at: row.created_at,
        }));

        return NextResponse.json({ success: true, count: results.length, results });
    } catch (error: any) {
        if (error instanceof PremiumRequiredError) {
            return NextResponse.json({ error: 'PREMIUM_REQUIRED' }, { status: 402 });
        }
        console.error('[Sources:Query] Fatal Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error?.message },
            { status: 500 }
        );
    }
}
