/**
 * workers/vectorizationWorker.ts
 *
 * Standalone long-lived Node.js worker for the Data Refinery Engine — Vectorization layer.
 *
 * Consumes traces from Upstash Redis (queue), embeds them via the NVIDIA NIM client,
 * and writes (v_x, action, v_y) tuples to Supabase using batch upserts.
 *
 * Vercel serverless timeout safety:
 *   This worker runs as a standalone Node process. If it is ever triggered from a
 *   Vercel Cron route, the route must call this worker with a time-boxed budget
 *   rather than attempting to drain the entire queue in one execution.
 *   For the local daemon process, `MAX_BATCH` / `BATCH_INTERVAL_MS` controls backpressure.
 *
 * Env vars
 * --------
 * - VECTORIZATION_QUEUE: Upstash queue name (default: "vectorization")
 * - VECTORIZATION_BATCH_SIZE: max rows per DB upsert (default: 250)
 * - VECTORIZATION_BATCH_INTERVAL_MS: pause between DB writes (default: 100)
 * - LATTICE_NIM_MODE: local | cloud (default: local)
 * - VECTORIZATION_SLEEP_MS: idle wait when queue empty (default: 5000)
 */

import { createClient } from '@supabase/supabase-js';
import { embedBatch, DEFAULT_EMBED_DIM, DEFAULT_EMBED_MODEL } from '../lib/ai/nimEmbeddingClient';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const QUEUE_NAME = process.env.VECTORIZATION_QUEUE ?? 'vectorization';
const BATCH_SIZE = Number(process.env.VECTORIZATION_BATCH_SIZE ?? '250');
const BATCH_INTERVAL_MS = Number(process.env.VECTORIZATION_BATCH_INTERVAL_MS ?? '100');
const IDLE_SLEEP_MS = Number(process.env.VECTORIZATION_SLEEP_MS ?? '5000');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USE_UPSTASH = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('[VectorizationWorker] Supabase not configured — worker will fail on DB writes');
}

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

let upstashClient: Awaited<ReturnType<typeof import('@upstash/redis').createRedis>> | null = null;

async function getUpstash() {
  if (!USE_UPSTASH) return null;
  if (!upstashClient) {
    const { Redis } = await import('@upstash/redis');
    upstashClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return upstashClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorizationTrace {
  id?: string;
  workspace_id: string;
  user_id: string;
  v_x: number[];      // current state embedding
  action: string;     // action label / function name / surface token
  v_y: number[];      // next-state / outcome embedding
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

async function dequeueBatch(count: number): Promise<VectorizationTrace[]> {
  const redis = await getUpstash();
  if (!redis) {
    // Local fallback: read from JSONL file if present
    return dequeueFromFile(count);
  }

  const raw = await redis.lrange(QUEUE_NAME, 0, count - 1);
  if (!raw.length) return [];
  await redis.ltrim(QUEUE_NAME, raw.length, -1);
  return raw.map((item: string) => {
    try {
      return JSON.parse(item) as VectorizationTrace;
    } catch {
      return null;
    }
  }).filter(Boolean) as VectorizationTrace[];
}

const FILE_QUEUE_PATH = process.env.VECTORIZATION_FILE_QUEUE ?? 'research/world-model/jepa-local/vectorization_queue.jsonl';

async function dequeueFromFile(count: number): Promise<VectorizationTrace[]> {
  try {
    const { readFileSync, existsSync } = await import('node:fs');
    if (!existsSync(FILE_QUEUE_PATH)) return [];
    const lines = readFileSync(FILE_QUEUE_PATH, 'utf8').split('\n').filter(Boolean);
    const batch = lines.slice(0, count);
    // Truncate file to remaining lines
    const remaining = lines.slice(count);
    await import('node:fs').promises.writeFile(FILE_QUEUE_PATH, remaining.join('\n') + (remaining.length ? '\n' : ''), 'utf8');
    return batch.map((l) => JSON.parse(l));
  } catch (err) {
    logger.error('[VectorizationWorker] file queue read failed', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch upsert to Supabase
// ---------------------------------------------------------------------------

async function upsertTuples(traces: VectorizationTrace[]): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured — cannot upsert vector tuples');
  }
  if (!traces.length) return;

  const rows = traces.map((t) => ({
    workspace_id: t.workspace_id,
    user_id: t.user_id,
    v_x: t.v_x,
    action: t.action,
    v_y: t.v_y,
    embedding_model: DEFAULT_EMBED_MODEL,
    embedding_dim: DEFAULT_EMBED_DIM,
    created_at: t.created_at ?? new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('wm_edges')
    .upsert(rows, { count: 'exact', onConflict: 'id' });

  if (error) {
    logger.error('[VectorizationWorker] batch upsert failed', { error: error.message, count: rows.length });
    throw error;
  }
  logger.info(`[VectorizationWorker] upserted ${rows.length} tuples`);
}

// ---------------------------------------------------------------------------
// Embedding pipeline
// ---------------------------------------------------------------------------

async function enrichWithEmbeddings(traces: VectorizationTrace[]): Promise<VectorizationTrace[]> {
  const needsX = traces.filter((t) => !t.v_x?.length);
  const needsY = traces.filter((t) => !t.v_y?.length);
  const allTexts = [...needsX.map((t) => t.action), ...needsY.map((t) => t.action)];

  if (!allTexts.length) return traces;

  const embeddings = await embedBatch(allTexts);
  let idx = 0;

  for (const t of needsX) {
    if (embeddings[idx]) t.v_x = embeddings[idx++].vector;
  }
  for (const t of needsY) {
    if (embeddings[idx]) t.v_y = embeddings[idx++].vector;
  }
  return traces;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function processBatch(): Promise<void> {
  const traces = await dequeueBatch(BATCH_SIZE);
  if (!traces.length) {
    await sleep(IDLE_SLEEP_MS);
    return;
  }

  logger.info(`[VectorizationWorker] dequeued ${traces.length} traces`);

  const enriched = await enrichWithEmbeddings(traces);
  await upsertTuples(enriched);

  // Vercel Cron safety: yield between batches so we don't blow the function timeout.
  await sleep(BATCH_INTERVAL_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('[VectorizationWorker] started — upstash:', USE_UPSTASH ? 'yes' : 'no', 'queue:', QUEUE_NAME);
  console.log(`[VectorizationWorker] batch=${BATCH_SIZE} interval=${BATCH_INTERVAL_MS}ms idle=${IDLE_SLEEP_MS}ms`);

  process.on('SIGINT', async () => {
    console.log('[VectorizationWorker] SIGINT; stopping');
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    console.log('[VectorizationWorker] SIGTERM; stopping');
    process.exit(0);
  });

  while (true) {
    try {
      await processBatch();
    } catch (err) {
      logger.error('[VectorizationWorker] batch processing error', err);
      await sleep(IDLE_SLEEP_MS);
    }
  }
}

main().catch((err) => {
  console.error('[VectorizationWorker] fatal', err);
  process.exit(1);
});
