import { NextRequest, NextResponse } from 'next/server';
import { generateConversationReply } from '@/lib/llm/conversationEngine';
import { ConversationRequestSchema } from '@/lib/llm/conversationEngine';

export const dynamic = 'force-dynamic';

function sseEncode(data: string, event = 'message') {
  const payload = `event: ${event}\ndata: ${data}\n\n`;
  return new TextEncoder().encode(payload);
}

const LATTICE_CLI_TOKEN = process.env.LATTICE_CLI_TOKEN || '';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const provided = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

    if (!LATTICE_CLI_TOKEN || !provided || provided !== LATTICE_CLI_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = req.headers.get('x-lattice-user-id') || 'cli-token-auth';
    if (!userId) {
      return NextResponse.json({ error: 'Missing x-lattice-user-id header' }, { status: 401 });
    }

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
      },
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
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';

