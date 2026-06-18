/**
 * POST /api/v1/memory — Write a memory to the partner's workspace.
 * GET  /api/v1/memory — List memories from the partner's workspace.
 *
 * Scope required: memory:write (POST), memory:read (GET)
 *
 * POST body:
 *   { content: string, type?: "fact"|"preference"|"code_chunk"|"conversation_summary", metadata?: object }
 *
 * GET query params:
 *   ?limit=20&offset=0
 *
 * Memories are scoped to the workspace via the partner key — partners can
 * only read/write within their own workspace.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/api/partnerAuth';
import { withMetering } from '@/lib/api/partnerUsage';
import { storeMemory, listMemories } from '@/lib/memory/vectorStore';
import type { MemoryType } from '@/lib/memory/vectorStore';

export const dynamic = 'force-dynamic';

// ----- Write a memory -----
export async function POST(req: NextRequest) {
  const auth = await authenticatePartner(req, 'memory:write');
  if (!auth.ok) return auth.response;

  return withMetering(
    {
      keyId: auth.context.keyId,
      workspaceId: auth.context.workspaceId,
      endpoint: '/api/v1/memory',
      method: 'POST',
    },
    async () => {
      const body = await req.json();
      const { content, type, metadata } = body ?? {};

      if (!content || typeof content !== 'string') {
        return {
          result: NextResponse.json({ error: 'content is required' }, { status: 400 }),
          statusCode: 400,
        };
      }

      const memoryType: MemoryType = (['fact', 'preference', 'code_chunk', 'conversation_summary'] as const).includes(type)
        ? type
        : 'fact';

      // Use a workspace-derived user ID so memories are isolated per workspace.
      // The partner's workspace owns these memories, not an individual user.
      const workspaceUserId = `partner_ws_${auth.context.workspaceId}`;

      const id = await storeMemory(workspaceUserId, content, memoryType, metadata ?? {}, {
        scope: 'workspace',
        workspaceId: auth.context.workspaceId,
      });

      if (!id) {
        return {
          result: NextResponse.json({ error: 'Failed to store memory' }, { status: 500 }),
          statusCode: 500,
        };
      }

      return {
        result: NextResponse.json({
          success: true,
          id,
          workspace: auth.context.workspaceId,
          type: memoryType,
        }),
        statusCode: 201,
      };
    }
  );
}

// ----- List memories -----
export async function GET(req: NextRequest) {
  const auth = await authenticatePartner(req, 'memory:read');
  if (!auth.ok) return auth.response;

  return withMetering(
    {
      keyId: auth.context.keyId,
      workspaceId: auth.context.workspaceId,
      endpoint: '/api/v1/memory',
      method: 'GET',
    },
    async () => {
      const { searchParams } = new URL(req.url);
      const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
      const offset = parseInt(searchParams.get('offset') || '0');

      // Read from the workspace-scoped user ID
      const workspaceUserId = `partner_ws_${auth.context.workspaceId}`;
      const memories = await listMemories(workspaceUserId, limit, offset);

      return {
        result: NextResponse.json({
          memories,
          total: memories.length,
          limit,
          offset,
          workspace: auth.context.workspaceId,
        }),
        statusCode: 200,
      };
    }
  );
}
