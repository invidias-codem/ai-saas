"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports._evictCacheForId = _evictCacheForId;
exports._clearCache = _clearCache;
exports._resetSupabase = _resetSupabase;
exports.recordExecution = recordExecution;
exports.findMatchingProcedure = findMatchingProcedure;
exports.promoteToMacro = promoteToMacro;
exports.invalidateProcedure = invalidateProcedure;
const supabase_js_1 = require("@supabase/supabase-js");
const embedding_1 = require("@/lib/memory/embedding");
// ─── Constants ────────────────────────────────────────────────────────────────
const SIMILARITY_THRESHOLD = 0.88;
const AUTO_PROMOTE_MIN_SUCCESSES = 3;
const AUTO_PROMOTE_MIN_CONFIDENCE = 0.85;
/** Invalid high failure count used for soft-invalidation */
const INVALIDATION_FAILURE_COUNT = 9999;
/** Module-level LRU cache keyed by `userId::taskDescription[::taskType]` */
const _cache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
function cacheKey(userId, taskDescription, taskType) {
    return `${userId}::${taskDescription}${taskType ? `::${taskType}` : ''}`;
}
function cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry)
        return undefined; // cache miss
    if (Date.now() > entry.expiresAt) {
        _cache.delete(key);
        return undefined; // expired
    }
    // LRU: re-insert to move to end of insertion-order Map
    _cache.delete(key);
    _cache.set(key, entry);
    return entry.match; // may be null (cached "no match")
}
function cacheSet(key, match) {
    if (_cache.size >= CACHE_MAX_SIZE) {
        // Evict the oldest (first) entry
        const firstKey = Array.from(_cache.keys())[0];
        if (firstKey !== undefined)
            _cache.delete(firstKey);
    }
    _cache.set(key, { match, expiresAt: Date.now() + CACHE_TTL_MS });
}
/** Exported for testing only — invalidates all entries for a given procedural id */
function _evictCacheForId(id) {
    for (const [key, entry] of Array.from(_cache.entries())) {
        if (entry.match?.record.id === id) {
            _cache.delete(key);
        }
    }
}
/** Exported for testing — clears the entire cache */
function _clearCache() {
    _cache.clear();
}
// ─── Supabase Client (service-role, server-only) ──────────────────────────────
let _supabase = null;
function _resetSupabase() { _supabase = null; }
function getSupabase() {
    if (_supabase)
        return _supabase;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.warn('[ProceduralMemory] SUPABASE_SERVICE_ROLE_KEY or URL missing — disabled');
        return null;
    }
    _supabase = (0, supabase_js_1.createClient)(url, key);
    return _supabase;
}
function rowToRecord(row) {
    return {
        id: row.id,
        userId: row.user_id,
        taskType: row.task_type,
        taskDescription: row.task_description,
        toolSequence: row.tool_sequence ?? [],
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
function recordExecution(userId, taskType, taskDescription, sequence, success, latencyMs) {
    // Fire and forget — intentionally not awaited
    void _recordExecutionAsync(userId, taskType, taskDescription, sequence, success, latencyMs);
}
async function _recordExecutionAsync(userId, taskType, taskDescription, sequence, success, latencyMs) {
    try {
        const db = getSupabase();
        if (!db)
            return;
        const embedding = await (0, embedding_1.generateEmbedding)(taskDescription);
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
        const existing = matches && matches.length > 0 ? matches[0] : null;
        if (existing) {
            // Update existing record
            const newSuccessCount = existing.success_count + (success ? 1 : 0);
            const newFailureCount = existing.failure_count + (success ? 0 : 1);
            const total = newSuccessCount + newFailureCount;
            const newAvgLatency = Math.round((existing.avg_latency_ms * (total - 1) + latencyMs) / total);
            const shouldPromote = newSuccessCount >= AUTO_PROMOTE_MIN_SUCCESSES &&
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
            }
            else {
                // Evict stale cache entry for this id
                _evictCacheForId(existing.id);
                if (shouldPromote) {
                    console.log(`[ProceduralMemory] ✦ Auto-promoted procedure ${existing.id} to macro`);
                }
            }
        }
        else {
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
    }
    catch (err) {
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
async function findMatchingProcedure(userId, taskDescription, taskType) {
    const key = cacheKey(userId, taskDescription, taskType);
    // Cache hit
    const cached = cacheGet(key);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const db = getSupabase();
        if (!db)
            return null;
        const embedding = await (0, embedding_1.generateEmbedding)(taskDescription);
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
        const row = data[0];
        const record = rowToRecord(row);
        const isStableMacro = record.successCount >= AUTO_PROMOTE_MIN_SUCCESSES &&
            record.confidence >= AUTO_PROMOTE_MIN_CONFIDENCE &&
            record.promotedAt !== null;
        const match = {
            record,
            similarity: row.similarity,
            isStableMacro,
        };
        cacheSet(key, match);
        return match;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ProceduralMemory] findMatchingProcedure exception:', msg);
        return null;
    }
}
/**
 * Explicitly promote a procedural record to a stable macro.
 * Sets promoted_at = now() and evicts cache entries for this id.
 */
async function promoteToMacro(id) {
    const db = getSupabase();
    if (!db)
        return;
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
async function invalidateProcedure(id) {
    const db = getSupabase();
    if (!db)
        return;
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
