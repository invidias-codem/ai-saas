/**
 * POST /api/v1/stream — SSE streaming semantic search.
 *
 * Scope required: stream:read
 *
 * Identical to /api/v1/query but streams results as Server-Sent Events,
 * which agent frameworks prefer for real-time context retrieval.
 *
 * Body: { query: string, limit?: number }
 *
 * Event format:
 *   data: {"id":"...","content":"...","type":"fact","similarity":0.89}
 *   data: {"id":"...","content":"...","type":"preference","similarity":0.85}
 *   ...
 *   data: [DONE]
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { recordUsage } from '@/lib/api/partnerUsage';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req, 'stream:read');
  if (!auth.ok) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { query, limit } = body ?? {};
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const topK = Math.min(typeof limit === 'number' ? limit : 10, 50);
  const start = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        if (!supabaseAdmin) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Backend not configured' })}\n\n`));
          controller.close();
          return;
        }

        // 1. Generate embedding
        const embeddingResult = await generateEmbeddingWithMetadata(query);

        // 2. Vector search scoped to workspace
        const workspaceUserId = `partner_ws_${auth.context.workspaceId}`;
        const rpcName = embeddingResult.dimension === 768 ? 'match_memories_768' : 'match_memories_3072';

        let results: any[] | null = null;
        try {
          const { data, error } = await supabaseAdmin.rpc(rpcName, {
            query_embedding: embeddingResult.vector,
            match_user_id: workspaceUserId,
            match_count: topK,
          });
          if (!error) results = data;
        } catch {
          // Fallback to simple list
          const { data } = await supabaseAdmin
            .from('memory_bank')
            .select('id, content, type, metadata, extracted_at')
            .eq('user_id', workspaceUserId)
            .eq('scope', 'workspace')
            .order('extracted_at', { ascending: false })
            .limit(topK);
          results = data;
        }

        // 3. Stream each result as an SSE event
        for (const r of results ?? []) {
          const event = {
            id: r.id,
            content: r.content,
            type: r.type,
            similarity: r.similarity ?? null,
            created_at: r.extracted_at,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        // 4. Done signal
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));

        // 5. Record usage (fire-and-forget)
        void recordUsage({
          keyId: auth.context.keyId,
          workspaceId: auth.context.workspaceId,
          endpoint: '/api/v1/stream',
          method: 'POST',
          statusCode: 200,
          tokensIn: query.length,
          tokensOut: JSON.stringify(results ?? []).length,
          modelUsed: embeddingResult.model,
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
        void recordUsage({
          keyId: auth.context.keyId,
          workspaceId: auth.context.workspaceId,
          endpoint: '/api/v1/stream',
          method: 'POST',
          statusCode: 500,
          tokensIn: query?.length ?? 0,
          tokensOut: 0,
          latencyMs: Date.now() - start,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
