/**
 * lib/jepa/traceEmitters.ts
 *
 * Concrete ITraceEmitter implementations for JEPA execution traces.
 * Supports Upstash Redis streams (preferred for write volume) and
 * Supabase table (preferred for query flexibility).
 */

import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import type { ExecutionTrace, ITraceEmitter } from './executionTrace';
import { ConsoleTraceEmitter, NoopTraceEmitter } from './executionTrace';

// ─── Upstash Redis Stream Emitter ─────────────────────────────────────────────
// Uses Redis streams for high-throughput, append-only trace ingestion.
// Stream key: "jepa:traces:{workspaceId}" — partitioned by workspace for
// independent retention and consumer groups.

export class UpstashTraceEmitter implements ITraceEmitter {
  private redis: Redis | null = null;
  private initialized = false;
  private initError: Error | null = null;

  private lazyInit(): void {
    if (this.initialized) return;
    this.initialized = true;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      this.initError = new Error('UPSTASH_REDIS_REST_URL/TOKEN not configured');
      return;
    }

    try {
      this.redis = new Redis({ url, token });
    } catch (err) {
      this.initError = err as Error;
    }
  }

  async emit(trace: ExecutionTrace): Promise<void> {
    this.lazyInit();

    if (this.initError || !this.redis) {
      // Fail silently — trace emission must never break execution flow.
      // Log for debugging but don't throw.
      if (process.env.NODE_ENV === 'development') {
        console.warn('[UpstashTraceEmitter] Skipping emit:', this.initError?.message || 'Redis not initialized');
      }
      return;
    }

    try {
      const streamKey = `jepa:traces:${trace.workspaceId}`;
      // XADD with MAXLEN ~ 10000 per workspace (auto-trim oldest)
      // Use '*' for auto-generated stream ID.
      // xadd signature: xadd(key, id, entries, opts?)
      await this.redis.xadd(
        streamKey,
        '*',
        {
          trace: JSON.stringify(trace),
          traceId: trace.traceId,
          sessionId: trace.sessionId,
          actionType: trace.action.type,
          exitCode: String(trace.s_y.exitCode ?? 'null'),
          timestamp: trace.timestamp,
        },
        { trim: { type: 'MAXLEN', threshold: 10000, comparison: '~' } }
      );
    } catch (err) {
      // Swallow errors — fire-and-forget telemetry
      if (process.env.NODE_ENV === 'development') {
        console.warn('[UpstashTraceEmitter] Emit failed:', err);
      }
    }
  }
}

// ─── Supabase Table Emitter ───────────────────────────────────────────────────
// Writes traces to a dedicated jepa_execution_traces table.
// Allows rich querying (filter by action type, time range, workspace, etc.)
// and easy export for training data extraction.

export class SupabaseTraceEmitter implements ITraceEmitter {
  private supabase: ReturnType<typeof createClient> | null = null;
  private initialized = false;
  private initError: Error | null = null;

  private lazyInit(): void {
    if (this.initialized) return;
    this.initialized = true;

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      this.initError = new Error('Supabase credentials not configured');
      return;
    }

    try {
      this.supabase = createClient(url, key);
    } catch (err) {
      this.initError = err as Error;
    }
  }

  async emit(trace: ExecutionTrace): Promise<void> {
    this.lazyInit();

    if (this.initError || !this.supabase) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[SupabaseTraceEmitter] Skipping emit:', this.initError?.message || 'Supabase not initialized');
      }
      return;
    }

    try {
      // Convert trace to flat row for the table
      const row = {
        trace_id: trace.traceId,
        session_id: trace.sessionId,
        workspace_id: trace.workspaceId,
        user_id: trace.userId,
        s_x_source_files: trace.s_x.sourceFiles,
        s_x_ast_fingerprint: trace.s_x.astFingerprint,
        s_x_embedding: trace.s_x.embedding,
        action_type: trace.action.type,
        action_command: trace.action.command ?? null,
        action_file_path: trace.action.filePath ?? null,
        action_patch_search: trace.action.patchSearch ?? null,
        action_language: trace.action.language ?? null,
        action_metadata: trace.action.metadata ?? {},
        s_y_exit_code: trace.s_y.exitCode,
        s_y_stdout: trace.s_y.stdout,
        s_y_stderr: trace.s_y.stderr,
        s_y_timed_out: trace.s_y.timedOut,
        s_y_duration_ms: trace.s_y.durationMs,
        s_y_artifacts: trace.s_y.artifacts,
        s_y_embedding: trace.s_y.embedding,
        timestamp: trace.timestamp,
      };

      const { error } = await (this.supabase as any)
        .from('jepa_execution_traces')
        .insert([row]);

      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[SupabaseTraceEmitter] Insert error:', error.message);
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[SupabaseTraceEmitter] Emit failed:', err);
      }
    }
  }
}

// ─── Dual Emitter (writes to both) ────────────────────────────────────────────

export class DualTraceEmitter implements ITraceEmitter {
  constructor(
    private readonly primary: ITraceEmitter,
    private readonly secondary: ITraceEmitter,
  ) {}

  async emit(trace: ExecutionTrace): Promise<void> {
    // Fire both in parallel, swallow all errors
    await Promise.allSettled([
      this.primary.emit(trace),
      this.secondary.emit(trace),
    ]);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _defaultEmitter: ITraceEmitter | null = null;

/**
 * Get the default trace emitter based on available configuration.
 * Priority:
 * 1. Dual (Upstash + Supabase) if both configured
 * 2. Upstash only if configured
 * 3. Supabase only if configured
 * 4. ConsoleTraceEmitter in development
 * 5. NoopTraceEmitter otherwise
 */
export async function getDefaultTraceEmitter(): Promise<ITraceEmitter> {
  if (_defaultEmitter) return _defaultEmitter;

  const upstashConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const supabaseConfigured = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (upstashConfigured && supabaseConfigured) {
    _defaultEmitter = new DualTraceEmitter(
      new UpstashTraceEmitter(),
      new SupabaseTraceEmitter(),
    );
  } else if (upstashConfigured) {
    _defaultEmitter = new UpstashTraceEmitter();
  } else if (supabaseConfigured) {
    _defaultEmitter = new SupabaseTraceEmitter();
  } else if (process.env.NODE_ENV === 'development') {
    _defaultEmitter = new ConsoleTraceEmitter();
  } else {
    _defaultEmitter = new NoopTraceEmitter();
  }

  return _defaultEmitter;
}

/**
 * Reset the cached emitter (useful for tests or config changes).
 */
export function resetDefaultTraceEmitter(): void {
  _defaultEmitter = null;
}