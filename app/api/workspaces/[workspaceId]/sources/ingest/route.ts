// app/api/workspaces/[workspaceId]/sources/ingest/route.ts
// Source-agnostic ingestion endpoint for the chameleon consultant.
//
// Accepts notes, pasted text, URLs (scraped content), PDF text, and
// NotebookLM-style exports; chunks, optionally cleanses, embeds, and upserts
// into public.workspace_sources — the unified knowledge substrate Weaver
// retrieves from during inference.
//
// Body:
// {
//   "sources": [
//     {
//       "source_type": "note" | "paste" | "url" | "pdf" | "notebooklm" | "github" | "refinery",
//       "title"?: string,
//       "origin_uri"?: string,
//       "raw_text": string,
//       "metadata"?: object,
//       "cleanse"?: boolean        // run a Gemini-Flash structuring pass (messy input)
//     }
//   ],
//   "supersede"?: boolean          // if true, close out prior valid rows sharing origin_uri
// }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { PremiumRequiredError } from '@/lib/ai/auth';
import { prepareSourceChunks, SOURCE_TYPES } from '@/lib/ai/sourceIngest';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // chunking + batch embed + optional cleanse

const IngestBodySchema = z.object({
    sources: z.array(
        z.object({
            source_type: z.enum(SOURCE_TYPES),
            title: z.string().max(500).optional(),
            origin_uri: z.string().max(2000).optional(),
            raw_text: z.string().min(1),
            metadata: z.record(z.any()).optional(),
            cleanse: z.boolean().optional(),
        })
    ).min(1).max(25),
    supersede: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { workspaceId: string } }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { workspaceId } = params;
        const body = await req.json().catch(() => ({}));
        const validation = IngestBodySchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: validation.error.flatten() },
                { status: 400 }
            );
        }
        const { sources, supersede } = validation.data;

        if (!supabaseAdmin) {
            throw new Error('Supabase Admin client not initialized');
        }

        // Verify workspace access (matches existing ingest route convention)
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

        const googleApiKey = process.env.GOOGLE_API_KEY;

        // 1. Normalize all sources into chunks.
        const perSource = await Promise.all(
            sources.map(s => prepareSourceChunks(s, { googleApiKey }))
        );

        // 2. Optionally supersede older versions of the same origin_uri so a
        //    re-ingest becomes a new authoritative version (append-only).
        let supersededRows = 0;
        if (supersede) {
            const origins = [...new Set(sources.map(s => s.origin_uri).filter(Boolean))] as string[];
            for (const origin of origins) {
                const { data, error } = await supabaseAdmin.rpc('supersede_workspace_source', {
                    target_workspace_id: workspaceId,
                    target_origin_uri: origin,
                });
                if (!error && typeof data === 'number') supersededRows += data;
            }
        }

        // 3. Embed in controlled batches (matches existing ingest pacing).
        const allChunks = perSource.flat();
        const batchSize = 10;
        const rows: any[] = [];

        for (let i = 0; i < allChunks.length; i += batchSize) {
            const batch = allChunks.slice(i, i + batchSize);
            const embedded = await Promise.all(
                batch.map(async (c) => {
                    let embedding: number[] | null = null;
                    try {
                        embedding = await generateEmbedding(c.content, userId);
                    } catch {
                        // Persist the row even if embedding fails — raw content
                        // is still retrievable via keyword and can be re-embedded.
                        embedding = null;
                    }
                    return {
                        workspace_id: workspaceId,
                        user_id: userId,
                        source_type: c.source_type,
                        title: c.title ?? null,
                        origin_uri: c.origin_uri ?? null,
                        raw_text: c.raw_text,
                        content: c.content,
                        embedding,
                        metadata: c.metadata,
                    };
                })
            );
            rows.push(...embedded);
        }

        // 4. Bulk insert.
        let inserted = 0;
        if (rows.length > 0) {
            const { error: insertError } = await supabaseAdmin
                .from('workspace_sources')
                .insert(rows);

            if (insertError) {
                console.error('[Sources:Ingest] Supabase insert error:', insertError);
                throw new Error(`Failed to insert sources: ${insertError.message}`);
            }
            inserted = rows.length;
        }

        return NextResponse.json({
            success: true,
            sources_received: sources.length,
            chunks_inserted: inserted,
            superseded_rows: supersededRows,
        });
    } catch (error: any) {
        if (error instanceof PremiumRequiredError) {
            return NextResponse.json({ error: 'PREMIUM_REQUIRED' }, { status: 402 });
        }
        console.error('[Sources:Ingest] Fatal Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error?.message },
            { status: 500 }
        );
    }
}
