// app/api/code-builder/build/[buildId]/events/route.ts
// Phase 4B: server-side Realtime relay for durable Code Builder builds.
//
// The browser subscribes to THIS route (EventSource, Clerk-cookie auth), never
// to Trigger directly — no Trigger internals cross the product boundary. The
// server consumes Trigger Realtime (runs.subscribeToRun, our own secret key,
// node runtime) and re-emits only the product status shape.
//
// Reconcile-on-observe (qodo #1): CRASHED/SYSTEM_FAILURE/CANCELED/EXPIRED/
// TIMED_OUT bypass the worker's onFailure hook, so the durable row can stay
// 'running' forever. The relay is the trusted server-side observer that sees
// those statuses — it persists the terminal state FIRST (idempotent), then
// emits, so the client's authoritative poll observes a persisted terminal row.
//
// Rotate each SSE connection before Vercel's 300s cap. EventSource reconnects
// and replays current run state; connection expiry never terminates the build.

import { requireAuth, handleAuthError } from '@/lib/security/apiAuth';
import { getBuild, failBuild, cancelBuild } from '@/lib/code-builder/buildStore';
import { env } from '@/lib/env';
import { isTerminalRunStatus, isSuccessfulRunStatus } from '@/lib/code-builder/runStatus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Persist a platform-side terminal status into the durable row (idempotent —
 * failBuild/cancelBuild are no-ops on already-terminal rows). Success-family
 * statuses need no reconcile: the worker's own completeBuild owns those.
 */
async function reconcileTerminal(buildId: string, status: string): Promise<void> {
  if (status === 'CANCELED') {
    await cancelBuild(buildId);
    return;
  }
  await failBuild(buildId, `TRIGGER_${status}`, `Durable run ended with ${status}`);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ buildId: string }> }
) {
  const streamDeadline = Date.now() + 240_000;
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
    let cleanupStream: (() => void) | undefined;
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        type RunSub = { unsubscribe: () => void; getReader: () => ReadableStreamDefaultReader<unknown> };
        let reader: ReadableStreamDefaultReader<unknown> | null = null;
        let sub: RunSub | null = null;
        let rotationTimer: ReturnType<typeof setTimeout> | undefined;
        const send = (event: string, data: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch { /* client gone */ }
        };

        // Idempotent teardown, safe to call from abort, error, or completion.
        // ponytail: reader.cancel() is the unblock path — a pending read can't
        // be interrupted by unsubscribe alone; cancelling its stream rejects
        // the read and drops the run into the finally block.
        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearTimeout(rotationTimer);
          req.signal.removeEventListener('abort', cleanup);
          try { void reader?.cancel().catch(() => {}); } catch { /* already cancelled */ }
          try { sub?.unsubscribe(); } catch { /* upstream already closed */ }
          try { controller.close(); } catch { /* already closed */ }
        };
        cleanupStream = cleanup;

        // qodo #5: create the subscription, then check already-aborted —
        // covers disconnects during setup; later aborts hit the listener.
        try {
          sub = runs.subscribeToRun(row.trigger_run_id!);
          const runReader = sub.getReader();
          reader = runReader;
          if (req.signal.aborted) return;
          req.signal.addEventListener('abort', cleanup);
          rotationTimer = setTimeout(cleanup, Math.max(0, streamDeadline - Date.now()));
          send('open', { buildId });
          while (true) {
            const run = await runReader.read();
            if (run.done) break;
            const status = String((run.value as { status?: string })?.status ?? '');
            if (isTerminalRunStatus(status)) {
              // Persist platform-side terminals before emitting, so the
              // client's authoritative poll sees a terminal row (qodo #1).
              // Success statuses are the worker's to own; failures/cancel
              // here are exactly the ones that bypass the onFailure hook.
              if (!isSuccessfulRunStatus(status)) {
                try { await reconcileTerminal(buildId, status); } catch { /* poll fallback */ }
              }
              send('run-status', { status, updatedAt: (run.value as { updatedAt?: string })?.updatedAt });
              break; // terminal — the relay has nothing more to say
            }
            send('run-status', { status, updatedAt: (run.value as { updatedAt?: string })?.updatedAt });
          }
        } catch {
          // Upstream stream error → let the client's EventSource reconnect;
          // polling remains the fallback backbone.
        } finally {
          cleanup();
        }
      },
      cancel() {
        cleanupStream?.();
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
