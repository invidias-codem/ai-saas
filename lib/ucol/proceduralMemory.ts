/**
 * lib/ucol/proceduralMemory.ts
 *
 * UCOL Procedural Memory — learns successful tool sequences and promotes
 * them to stable macros for fast-path routing.
 *
 * Architecture:
 *   - Embeddings via lib/memory/embedding.ts (Gemini embedding-001, 768-dim)
 *   - Storage in ucol_procedural_memory (Supabase, pgvector cosine similarity)
 *   - LRU-style in-process cache (50 entries, 10-min TTL) to skip hot DB lookups
 *   - fire-and-forget writes: recordExecution() never blocks the hot path
 *
 * Security:
 *   - Uses SUPABASE_SERVICE_ROLE_KEY only — server-side module, never bundled
 *     for the browser.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/memory/embedding';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolStep {
  /** Harness / tool name: 'gh' | 'supabase' | 'firebase' | 'gcloud' */
  tool: string;
  /** CLI command, e.g. 'pr list' */
  command: string;
  args: string[];
  expectedOutputShape?: Record<string, unknown>;
}

export interface ProceduralRecord {
  id: string;
  userId: string;
  taskType: string;
  taskDescription: string;
  toolSequence: ToolStep[];
  successCount: number;
  failureCount: number;
  confidence: number;
  avgLatencyMs: number;
  promotedAt: string | null;
  lastUsedAt: string;
}

export interface ProceduralMatch {
  record: ProceduralRecord;
  similarity: number;
  /** True when successCount >= 3 AND confidence >= 0.85 AND promoted_at is set */
  isStableMacro: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.88;
const AUTO_PROMOTE_MIN_SUCCESSES = 3;
const AUTO_PROMOTE_MIN_CONFIDENCE = 0.85;

/** Invalid high failure count used for soft-invalidation */
const INVALIDATION_FAILURE_COUNT = 9999;

// ─── LRU Cache ────────────────────────────────────────────────────────────────

interface CacheEntry {
  match: ProceduralMatch | null;
  expiresAt: number;
}

/** Module-level LRU cache keyed by `userId::taskDescription[::taskType]` */
const _cache = new Map<string, CacheEntry>();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(userId: string, taskDescription: string, taskType?: string): string {
  return `${userId}::${taskDescription}${taskType ? `::${taskType}` : ''}`;
}

function cacheGet(key: string): ProceduralMatch | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined; // cache miss
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined; // expired
  }
  // LRU: re-insert to move to end of insertion-order Map
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.match; // may be null (cached "no match")
}

function cacheSet(key: string, match: ProceduralMatch | null): void {
  if (_cache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest (first) entry
    const firstKey = Array.from(_cache.keys())[0];
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  _cache.set(key, { match, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Exported for testing only — invalidates all entries for a given procedural id */
export function _evictCacheForId(id: string): void {
  for (const [key, entry] of Array.from(_cache.entries())) {
    if (entry.match?.record.id === id) {
      _cache.delete(key);
    }
  }
}

/** Exported for testing — clears the entire cache */
export function _clearCache(): void {
  _cache.clear();
}

// ─── Supabase Client (service-role, server-only) ──────────────────────────────

let _supabase: SupabaseClient | null = null;

export function _resetSupabase(): void { _supabase = null; }
function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn('[ProceduralMemory] SUPABASE_SERVICE_ROLE_KEY or URL missing — disabled');
    return null;
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// ─── Row → ProceduralRecord ───────────────────────────────────────────────────

interface DbRow {
  id: string;
  user_id: string;
  task_type: string;
  task_description: string;
  tool_sequence: ToolStep[];
  success_count: number;
  failure_count: number;
  confidence: number;
  avg_latency_ms: number;
  promoted_at: string | null;
  last_used_at: string;
}

function rowToRecord(row: DbRow): ProceduralRecord {
  return {
    id: row.id,
    userId: row.user_id,
    taskType: row.task_type,
    taskDescription: row.task_description,
    toolSequence: (row.tool_sequence as ToolStep[]) ?? [],
    successCount: row.success_count,
    failureCount: row.failure_count,
    confidence: row.confidence,
    avgLatencyMs: row.avg_latency_ms,
    promotedAt: row.promoted_at,
    lastUsedAt: row.last_used_at,
  };
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Record the outcome of a tool execution sequence.
 *
 * Behaviour:
 *   - Computes a 768-dim embedding for taskDescription
 *   - If a cosine-similar record (>= 0.88) already exists → increment counts
 *     and update avgLatencyMs with a running mean
 *   - Otherwise → insert a new record
 *   - Auto-promotes to macro when successCount >= 3 AND confidence >= 0.85
 *
 * This is a FIRE-AND-FORGET function — never awaited on the hot path.
 * It swallows all errors so callers are never impacted.
 */
export function recordExecution(
  userId: string,
  taskType: string,
  taskDescription: string,
  sequence: ToolStep[],
  success: boolean,
  latencyMs: number
): void {
  // Fire and forget — intentionally not awaited
  void _recordExecutionAsync(userId, taskType, taskDescription, sequence, success, latencyMs);
}

async function _recordExecutionAsync(
  userId: string,
  taskType: string,
  taskDescription: string,
  sequence: ToolStep[],
  success: boolean,
  latencyMs: number
): Promise<void> {
  try {
    const db = getSupabase();
    if (!db) return;

    const embedding = await generateEmbedding(taskDescription);
    const embeddingLiteral = `[${embedding.join(',')}]`;

    // Try to find an existing similar record for this user+taskType
    const { data: matches, error: matchErr } = await db.rpc('match_procedural_memory', {
      p_user_id: userId,
      p_embedding: embeddingLiteral,
      p_task_type: taskType,
      p_threshold: SIMILARITY_THRESHOLD,
      p_limit: 1,
    });

    if (matchErr) {
      console.error('[ProceduralMemory] match error during recordExecution:', matchErr.message);
    }

    const existing = matches && matches.length > 0 ? (matches[0] as DbRow & { similarity: number }) : null;

    if (existing) {
      // Update existing record
      const newSuccessCount = existing.success_count + (success ? 1 : 0);
      const newFailureCount = existing.failure_count + (success ? 0 : 1);
      const total = newSuccessCount + newFailureCount;
      const newAvgLatency = Math.round(
        (existing.avg_latency_ms * (total - 1) + latencyMs) / total
      );

      const shouldPromote =
        newSuccessCount >= AUTO_PROMOTE_MIN_SUCCESSES &&
        newSuccessCount / total >= AUTO_PROMOTE_MIN_CONFIDENCE &&
        !existing.promoted_at;

      const { error: updateErr } = await db
        .from('ucol_procedural_memory')
        .update({
          success_count: newSuccessCount,
          failure_count: newFailureCount,
          avg_latency_ms: newAvgLatency,
          last_used_at: new Date().toISOString(),
          tool_sequence: sequence,
          ...(shouldPromote ? { promoted_at: new Date().toISOString() } : {}),
        })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('[ProceduralMemory] update error:', updateErr.message);
      } else {
        // Evict stale cache entry for this id
        _evictCacheForId(existing.id);
        if (shouldPromote) {
          console.log(`[ProceduralMemory] ✦ Auto-promoted procedure ${existing.id} to macro`);
        }
      }
    } else {
      // Insert new record
      const { error: insertErr } = await db
        .from('ucol_procedural_memory')
        .insert({
          user_id: userId,
          task_type: taskType,
          task_description: taskDescription,
          task_signature: embeddingLiteral,
          tool_sequence: sequence,
          success_count: success ? 1 : 0,
          failure_count: success ? 0 : 1,
          avg_latency_ms: latencyMs,
          last_used_at: new Date().toISOString(),
        });

      if (insertErr) {
        console.error('[ProceduralMemory] insert error:', insertErr.message);
      }
    }
  } catch (err: unknown) {
    // Never propagate — fire-and-forget contract
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ProceduralMemory] recordExecution swallowed error:', msg);
  }
}

/**
 * Search for a matching procedural record using cosine similarity.
 *
 * Returns the best match above the 0.88 threshold, or null if none found.
 * Results are LRU-cached for up to 10 minutes.
 */
export async function findMatchingProcedure(
  userId: string,
  taskDescription: string,
  taskType?: string
): Promise<ProceduralMatch | null> {
  const key = cacheKey(userId, taskDescription, taskType);

  // Cache hit
  const cached = cacheGet(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const db = getSupabase();
    if (!db) return null;

    const embedding = await generateEmbedding(taskDescription);
    const embeddingLiteral = `[${embedding.join(',')}]`;

    const { data, error } = await db.rpc('match_procedural_memory', {
      p_user_id: userId,
      p_embedding: embeddingLiteral,
      p_task_type: taskType ?? null,
      p_threshold: SIMILARITY_THRESHOLD,
      p_limit: 1,
    });

    if (error) {
      console.error('[ProceduralMemory] findMatchingProcedure error:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      cacheSet(key, null);
      return null;
    }

    const row = data[0] as DbRow & { similarity: number };
    const record = rowToRecord(row);
    const isStableMacro =
      record.successCount >= AUTO_PROMOTE_MIN_SUCCESSES &&
      record.confidence >= AUTO_PROMOTE_MIN_CONFIDENCE &&
      record.promotedAt !== null;

    const match: ProceduralMatch = {
      record,
      similarity: row.similarity,
      isStableMacro,
    };

    cacheSet(key, match);
    return match;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ProceduralMemory] findMatchingProcedure exception:', msg);
    return null;
  }
}

/**
 * Explicitly promote a procedural record to a stable macro.
 * Sets promoted_at = now() and evicts cache entries for this id.
 */
export async function promoteToMacro(id: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  const { error } = await db
    .from('ucol_procedural_memory')
    .update({ promoted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[ProceduralMemory] promoteToMacro error:', error.message);
    return;
  }

  _evictCacheForId(id);
  console.log(`[ProceduralMemory] ✦ Promoted procedure ${id}`);
}

/**
 * Soft-invalidate a procedure by inflating its failure count to collapse
 * the generated confidence column below any useful threshold.
 */
export async function invalidateProcedure(id: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  const { error } = await db
    .from('ucol_procedural_memory')
    .update({
      failure_count: INVALIDATION_FAILURE_COUNT,
      promoted_at: null,
    })
    .eq('id', id);

  if (error) {
    console.error('[ProceduralMemory] invalidateProcedure error:', error.message);
    return;
  }

  _evictCacheForId(id);
  console.log(`[ProceduralMemory] ✗ Invalidated procedure ${id}`);
}
