import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { generateConversationReply } from '@/lib/llm/conversationEngine';
import { ConversationRequestSchema } from '@/lib/llm/conversationEngine';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { startUcolSpan } from '@/lib/ucol/observability/span';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sseEncode(data: string, event = 'message') {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  return new TextEncoder().encode(payload);
}

async function resolveCliToken(authHeader: string): Promise<{ tenantId: string; userId: string } | null> {
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const rawToken = authHeader.slice('Bearer '.length).trim();
  if (!rawToken) {
    return null;
  }

  if (!supabaseAdmin) {
    return null;
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const { data, error } = await supabaseAdmin
    .from('tenant_cli_tokens')
    .select('id, tenant_id, user_id, revoked')
    .eq('token_hash', tokenHash)
    .eq('revoked', false)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  // Update last used timestamp
  await supabaseAdmin
    .from('tenant_cli_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    tenantId: data.tenant_id,
    userId: data.user_id,
  };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';

    const tokenContext = await resolveCliToken(authHeader);
    if (!tokenContext) {
      return NextResponse.json({ error: 'Invalid or revoked CLI token' }, { status: 401 });
    }

    const userId = tokenContext.userId;
    const tenantId = tokenContext.tenantId;

    const span = startUcolSpan({
      name: 'api:cli:stream',
      userId,
      metadata: { tenantId, surface: 'cli' },
    });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validationResult = ConversationRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const result = await generateConversationReply(
      {
        userId,
        clerkUser: null,
        request: validationResult.data,
        tenantId,
      } as any,
      {
        disableSideEffects: process.env.DISABLE_SIDE_EFFECTS === 'true',
        disableExternalContext: process.env.DISABLE_EXTERNAL_CONTEXT === 'true',
        mode: 'fast',
        sudoPromptNames: ['BashSafety', 'CLIStreamer', 'ToolRouter'],
      }
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = result.stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.trim().length > 0) {
                controller.enqueue(sseEncode(line));
              }
            }
          }

          if (buffer.trim().length > 0) {
            controller.enqueue(sseEncode(buffer));
          }

          controller.enqueue(sseEncode(JSON.stringify({ done: true }), 'done'));
        } catch (err: any) {
          controller.enqueue(sseEncode(JSON.stringify({ error: err?.message ?? 'stream error' }), 'error'));
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
        'X-Lattice-Trace-Id': span.traceId,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
