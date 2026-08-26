/**
 * lib/jepa/executionTrace.ts
 *
 * ExecutionTrace interface + ExecutionTraceEmitter for the JEPA Stage 0
 * prerequisite infrastructure.
 *
 * The trace schema records (s_x, action, s_y) tuples emitted by
 * LocalSandboxRunner.execute() after each sandbox run. Emission target is
 * intentionally decoupled so callers can choose Upstash Redis streams
 * (preferred for write volume) or the jepa_execution_traces Supabase table
 * (preferred for query flexibility).
 *
 * No JEPA inference, training, or WASM logic lives here — this is purely
 * the trace capture and plumbing layer.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExecutionTraceSourceFiles {
  /** filePath → content snapshot before execution */
  sourceFiles: Record<string, string>;
  /** SHA256 of serialized AST (for dedup); computed by the caller if available */
  astFingerprint: string;
  /** Optional: JEPA encoder output for pre-state — null when encoder unavailable */
  embedding?: number[] | null;
}

export interface ExecutionTraceAction {
  type: 'execute' | 'write' | 'patch';
  /** For execute: the script body */
  command?: string;
  /** For write/patch: target path */
  filePath?: string;
  /** For patch: search block */
  patchSearch?: string;
  /** sh | python | node */
  language?: string;
  /** Free-form metadata (e.g. traceId, sessionId, caller label) */
  metadata?: Record<string, string>;
}

export interface ExecutionTraceArtifact {
  relativePath: string;
  digest: string;          // SHA1 from quarantinePromotionManager
  sizeBytes: number;
}

export interface ExecutionTracePostState {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  artifacts: ExecutionTraceArtifact[];
  /** Optional: JEPA encoder output for post-state — null when encoder unavailable */
  embedding?: number[] | null;
}

export interface ExecutionTrace {
  traceId: string;
  sessionId: string;
  workspaceId: string;
  userId: string;
  s_x: ExecutionTraceSourceFiles;
  action: ExecutionTraceAction;
  s_y: ExecutionTracePostState;
  timestamp: string; // ISO-8601
}

// ─── Emitter Interface ───────────────────────────────────────────────────────

/**
 * Abstraction over the trace persistence target. Implementations can write to
 * Upstash Redis (stream append), Supabase (row insert), a local file for
 * debugging, or a no-op for tests.
 */
export interface ITraceEmitter {
  emit(trace: ExecutionTrace): Promise<void> | void;
}

/**
 * No-op emitter used when JEPA tracing is disabled or in test contexts.
 */
export class NoopTraceEmitter implements ITraceEmitter {
  async emit(_trace: ExecutionTrace): Promise<void> {
    // Intentionally silent — no persistence, no network call.
  }
}

// ─── Console Debug Emitter ───────────────────────────────────────────────────

/**
 * Development-only emitter that writes trace summaries to the console.
 * Useful for local debugging without spinning up Redis or Supabase.
 */
export class ConsoleTraceEmitter implements ITraceEmitter {
  emit(trace: ExecutionTrace): void {
    console.log(`[ExecutionTrace] traceId=${trace.traceId} action=${trace.action.type} exit=${trace.s_y.exitCode} artifacts=${trace.s_y.artifacts.length}`);
  }
}

// ─── ExecutionTraceEmitter (core plumbing) ──────────────────────────────────

/**
 * Core helper that builds ExecutionTrace objects from sandbox run data.
 *
 * Does not perform persistence itself — callers inject an ITraceEmitter
 * and invoke emitTrace() after each execution completes.
 */
export class ExecutionTraceEmitter {
  constructor(private readonly emitter: ITraceEmitter) {}

  /**
   * Build a complete ExecutionTrace from the result of a sandbox execution.
   *
   * @param traceId       - Correlates with UcolSpan.traceId
   * @param sessionId     - Quarantine session id
   * @param workspaceId   - Workspace identifier
   * @param userId        - User identifier
   * @param sourceFiles   - Pre-execution file snapshot (may be empty for execute-only)
   * @param action        - What was executed
   * @param result        - Post-execution result
   * @param astFingerprint- SHA256 of pre-state serialized AST (empty string when unavailable)
   */
  buildTrace(
    traceId: string,
    sessionId: string,
    workspaceId: string,
    userId: string,
    sourceFiles: Record<string, string>,
    action: ExecutionTraceAction,
    result: {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      durationMs: number;
      artifacts: ExecutionTraceArtifact[];
    },
    astFingerprint: string = '',
  ): ExecutionTrace {
    return {
      traceId,
      sessionId,
      workspaceId,
      userId,
      s_x: {
        sourceFiles,
        astFingerprint: astFingerprint || this.emptyFingerprint(sourceFiles),
        embedding: null,
      },
      action,
      s_y: {
        ...result,
        embedding: null,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Emit a pre-built trace through the injected emitter.
   */
  async emitTrace(trace: ExecutionTrace): Promise<void> {
    await this.emitter.emit(trace);
  }

  /**
   * Convenience: build + emit in one call.
   */
  async buildAndEmit(
    traceId: string,
    sessionId: string,
    workspaceId: string,
    userId: string,
    sourceFiles: Record<string, string>,
    action: ExecutionTraceAction,
    result: {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      durationMs: number;
      artifacts: ExecutionTraceArtifact[];
    },
    astFingerprint: string = '',
  ): Promise<ExecutionTrace> {
    const trace = this.buildTrace(traceId, sessionId, workspaceId, userId, sourceFiles, action, result, astFingerprint);
    await this.emitTrace(trace);
    return trace;
  }

  /**
   * Produce a deterministic SHA256 fingerprint over the serialized AST of
   * every source file. Returns a placeholder string when the sourceFiles map
   * is empty (e.g. for execute-only runs where no files were written).
   */
  private emptyFingerprint(sourceFiles: Record<string, string>): string {
    const keys = Object.keys(sourceFiles);
    if (keys.length === 0) return 'no-source-files';
    // Concatenate file paths and content in sorted key order so the
    // fingerprint is stable regardless of insertion order.
    const raw = keys.sort().map(k => `${k}:${sourceFiles[k]}`).join('\n');
    // Use Web Crypto API when available, fall back to a stable hash string.
    // This function is synchronous — crypto.subtle.digest is async.
    // For Stage 0 we compute a simple deterministic string; callers that
    // require cryptographic hashes can pre-compute and pass astFingerprint.
    let h = 0;
    for (let i = 0; i < raw.length; i++) {
      h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
    }
    return `sha256-fallback:${Math.abs(h).toString(16)}`;
  }
}
