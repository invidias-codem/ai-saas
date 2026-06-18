/**
 * POST /api/v1/query — Semantic search across the partner's workspace memories.
 *
 * Scope required: query:read
 *
 * Body:
 *   { query: string, limit?: number, include_scores?: boolean }
 *
 * Returns ranked memory results from the workspace's memory_bank, scored
 * by semantic similarity to the query. This is the UCOL-powered context
 * retrieval endpoint — the black-box secret sauce that partners pay for.
 *
 * Internally: generates an embedding for the query, runs vector similarity
 * search scoped to the workspace, and returns top-K results.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { withMetering } from '@/lib/api/partnerUsage';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { generateEmbeddingWithMetadata } from '@/lib/memory/embedding';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req, 'query:read');
  if (!auth.ok) return auth.response;

  return withMetering(
    {
      keyId: auth.context.keyId,
      workspaceId: auth.context.workspaceId,
      endpoint: '/api/v1/query',
      method: 'POST',
    },
    async () => {
      const body = await req.json();
      const { query, limit, include_scores } = body ?? {};

      if (!query || typeof query !== 'string') {
        return {
          result: NextResponse.json({ error: 'query is required' }, { status: 400 }),
          statusCode: 400,
        };
      }

      const topK = Math.min(typeof limit === 'number' ? limit : 10, 50);

      if (!supabaseAdmin) {
        return {
          result: NextResponse.json({ error: 'Backend not configured' }, { status: 500 }),
          statusCode: 500,
        };
      }

      // 1. Generate embedding for the query
      const embeddingResult = await generateEmbeddingWithMetadata(query);

      // 2. Run vector similarity search scoped to this workspace
      //    The workspace-scoped memories use user_id = partner_ws_{workspace_id}
      const workspaceUserId = `partner_ws_${auth.context.workspaceId}`;

      const rpcName = embeddingResult.dimension === 768 ? 'match_memories_768' : 'match_memories_3072';
      const { data: results, error: rpcError } = await supabaseAdmin.rpc(rpcName, {
        query_embedding: embeddingResult.vector,
        match_user_id: workspaceUserId,
        match_count: topK,
      });

      if (rpcError) {
        // Fallback: if the RPC doesn't exist yet, do a simple DB query
        console.warn(`[v1/query] ${rpcName} RPC failed, falling back to list:`, rpcError.message);
        const { data: fallbackResults } = await supabaseAdmin
          .from('memory_bank')
          .select('id, content, type, metadata, extracted_at')
          .eq('user_id', workspaceUserId)
          .eq('scope', 'workspace')
          .order('extracted_at', { ascending: false })
          .limit(topK);

        return {
          result: NextResponse.json({
            results: (fallbackResults ?? []).map((r: any) => ({
              id: r.id,
              content: r.content,
              type: r.type,
              metadata: r.metadata,
              created_at: r.extracted_at,
            })),
            query,
            total: (fallbackResults ?? []).length,
          }),
          statusCode: 200,
          tokensIn: query.length,
          tokensOut: JSON.stringify(fallbackResults ?? []).length,
        };
      }

      const formatted = (results ?? []).map((r: any) => ({
        id: r.id,
        content: r.content,
        type: r.type,
        metadata: r.metadata,
        created_at: r.extracted_at,
        ...(include_scores ? { similarity: r.similarity } : {}),
      }));

      return {
        result: NextResponse.json({
          results: formatted,
          query,
          total: formatted.length,
        }),
        statusCode: 200,
        tokensIn: query.length,
        tokensOut: JSON.stringify(formatted).length,
        modelUsed: embeddingResult.model,
      };
    }
  );
}
