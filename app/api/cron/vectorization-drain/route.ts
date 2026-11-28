/**
 * app/api/cron/vectorization-drain/route.ts
 *
 * Vercel Cron trigger for the Vectorization Worker heartbeat.
 *
 * Serverless timeout safety
 * -------------------------
 * Vercel functions have a hard execution limit (15–60s depending on tier).
 * If the Upstash queue has 10,000+ pending traces, we must NOT drain the
 * entire queue in a single invocation. Instead:
 *   1. Fetch at most VEC_DRAIN_CHUNK_SIZE items from the queue.
 *   2. Pass them through the NIM embed pipeline.
 *   3. Write to Supabase in a single batch upsert.
 *   4. Yield — Vercel will re-trigger this cron on its next schedule.
 *
 * The standalone worker in workers/vectorizationWorker.ts handles the
 * long-running daemon path for local Linux GPU rigs; this route exists
 * so Vercel-hosted environments can process vector traces via cloud NIM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/security/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { embedBatch, DEFAULT_EMBED_DIM, DEFAULT_EMBED_MODEL } from '@/lib/ai/nimEmbeddingClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const QUEUE_NAME = 'vectorization';
const CHUNK_SIZE = Number(process.env.VEC_DRAIN_CHUNK_SIZE ?? '150');
const MINUTES_BUDGET = Number(process.env.VEC_DRAIN_MINUTES_BUDGET ?? '3');
const BUDGET_MS = MINUTES_BUDGET * 60 * 1000;

async function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url, token });
}

function withinBudget(start: number): boolean {
  return Date.now() - start < BUDGET_MS;
}

export async function POST(req: NextRequest) {
  const authFailure = requireCronAuth(req, { routeName: 'VectorizationDrain' });
  if (authFailure) return authFailure;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const start = Date.now();
  let dequeued = 0;
  let embedded = 0;
  let upserted = 0;

  // Loop while we have time and items in the queue.
  while (withinBudget(start)) {
    const redis = await getUpstashRedis();
    if (!redis) {
      return NextResponse.json(
        { error: 'Upstash Redis not configured — cannot drain queue', dequeued, embedded, upserted },
        { status: 500 },
      );
    }

    const raw = await redis.lrange(QUEUE_NAME, 0, CHUNK_SIZE - 1);
    if (!raw.length) {
      break;
    }

    const traces = raw
      .map((item: string) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{
        workspace_id: string;
        user_id: string;
        action: string;
        v_x?: number[];
        v_y?: number[];
        created_at?: string;
        id?: string;
      }>;

    // Acknowledge batch immediately so we don't double-process on timeout.
    await redis.ltrim(QUEUE_NAME, raw.length, -1);
    dequeued += traces.length;

    // Embed missing vectors in one batched call.
    const texts = traces.map((t) => t.action);
    const embeddings = await embedBatch(texts);
    embedded += embeddings.length;

    const rows = traces.map((t, idx) => ({
      workspace_id: t.workspace_id,
      user_id: t.user_id,
      v_x: t.v_x ?? embeddings[idx].vector,
      v_y: t.v_y ?? embeddings[idx].vector,
      action: t.action,
      embedding_model: DEFAULT_EMBED_MODEL,
      embedding_dim: DEFAULT_EMBED_DIM,
      created_at: t.created_at ?? new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from('wm_edges')
      .upsert(rows, { count: 'exact', onConflict: 'id' });

    if (error) {
      console.error('[VectorizationDrain] upsert failed', error);
      return NextResponse.json(
        { error: error.message, dequeued, embedded, upserted, timedOut: !withinBudget(start) },
        { status: 500 },
      );
    }

    upserted += rows.length;

    // Yield control so Vercel can checkpoint the function execution.
    if (withinBudget(start)) {
      const remaining = await redis.llen(QUEUE_NAME);
      if ((remaining as number) > 0) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  return NextResponse.json({
    status: 'ok',
    dequeued,
    embedded,
    upserted,
    timedOut: withinBudget(start),
    budgetMs: BUDGET_MS,
    elapsedMs: Date.now() - start,
  });
}
