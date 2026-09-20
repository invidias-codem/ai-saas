// app/api/code-builder/build/[buildId]/events/route.ts
// Phase 4B: server-side Realtime relay for durable Code Builder builds.
//
// The browser subscribes to THIS route (EventSource, Clerk-cookie auth), never
// to Trigger directly — no Trigger internals cross the product boundary. The
// server consumes Trigger Realtime (runs.subscribeToRun, our own secret key,
// node runtime) and re-emits only the product status shape.
//
// Supabase remains the durable product state; this stream is a live "when to
// look" signal. Per-phase progress still comes from the existing poll.
//
// ponytail: this route holds an open SSE connection and is subject to Vercel's
// 300s function cap — the client's EventSource auto-reconnects and the stream
// replays the run's current state from history, so the cap costs one reconnect
// cycle, not correctness. Upgrade path: Trigger Realtime browser tokens if a
// future SDK ships a browser entry point.

import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { getBuild } from '@/lib/code-builder/buildStore';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ buildId: string }> }
) {
  try {
    if (!env.TRIGGER_SECRET_KEY) {
      return new Response('event: unavailable\n\ndata: {}\n\n', {
        status: 503,
        headers: sseHeaders(),
      });
    }

    const user = await requireAuth();
    const { buildId } = await params;
    if (!buildId) {
      return new Response('Missing buildId', { status: 400 });
    }

    const row = await getBuild(buildId);
    if (!row || row.user_id !== user.userId) {
      // Same 404 for not-found and not-owned (no existence disclosure).
      return new Response('Build not found', { status: 404 });
    }

    if (!row.trigger_run_id) {
      return new Response('No run to subscribe to', { status: 409 });
    }

    const { runs } = await import('@trigger.dev/sdk');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        // ponytail: subscription created before the abort listener is
        // attached; client aborts before this point fall through to the
        // finally-block unsubscribe.
        const sub = runs.subscribeToRun(row.trigger_run_id!);
        req.signal.addEventListener('abort', () => {
          closed = true;
          sub.unsubscribe();
          try { controller.close(); } catch { /* already closed */ }
        });
        send('open', { buildId });

        try {
          const reader = sub.getReader();
          while (true) {
            const run = await reader.read();
            if (run.done) break;
            // Product-boundary: emit only the run lifecycle status; never
            // payload/output/metadata. Client maps via its existing machine.
            send('run-status', { status: run.value.status, updatedAt: run.value.updatedAt });
          }
        } catch {
          // Upstream stream error → let the client's EventSource reconnect;
          // polling remains the fallback backbone.
        } finally {
          sub.unsubscribe();
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        }
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  } catch (error: any) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error('[UCOL:Build] realtime relay error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}
