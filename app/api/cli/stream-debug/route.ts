import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const words = ['debug', 'hello', 'world', 'from', 'lattice', 'cli'];
      let i = 0;
      const interval = setInterval(() => {
        if (i >= words.length) {
          controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`));
          clearInterval(interval);
          controller.close();
          return;
        }
        const token = words[i++];
        const payload = `event: message\ndata: ${token}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }, 120);
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
