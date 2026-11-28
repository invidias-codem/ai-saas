// lib/execution/isolatedRunner.ts
// Phase 2 execution boundary: isolated subprocess runner with strict timeouts,
// ephemeral scratch workspace, and native UCOL traceability.
//
// Security invariants:
//  - Zero filesystem state leak between runs
//  - Hard wall-clock timeout + output buffer cap
//  - Scoped environment; sandbox only receives PATH/HOME/TMPDIR/LANG/LC_ALL/SHELL plus explicit req.env
//  - Production deployments should add cgroup/container isolation

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { UcolSpan } from '../ucol/observability/span';
import type { ExecutionTrace, ITraceEmitter } from '../jepa/executionTrace';
import { ExecutionTraceEmitter, NoopTraceEmitter } from '../jepa/executionTrace';

export interface ExecutionRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python' | 'sh';
  timeoutMs?: number;
  env?: Record<string, string>;
  traceId?: string;
}

export interface ExecutionResult {
  executionId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB log cap

export class IsolatedRunner {
  private traceEmitterRef: ITraceEmitter = new NoopTraceEmitter();

  public setTraceEmitter(emitter: ITraceEmitter | null): void {
    this.traceEmitterRef = emitter ?? new NoopTraceEmitter();
  }

  public async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const timeoutMs = req.timeoutMs || DEFAULT_TIMEOUT_MS;
    const workspaceId = req.env?.LATTICE_WORKSPACE_ID || 'unknown';
    const userId = req.env?.LATTICE_USER_ID || 'unknown';

    // Correlate execution with Phase 1 UcolSpan
    const span = new UcolSpan({
      name: `execution:${req.language}`,
      traceId: req.traceId,
      metadata: { executionId, language: req.language, timeoutMs },
    });

    const scratchDir = join(tmpdir(), `lattice-exec-${executionId}`);
    const { command, args, fileName } = this.resolveRuntime(req.language);
    const filePath = join(scratchDir, fileName);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;

    const safeEnv = this.buildSandboxEnvironment(req.env, executionId);

    let executionError: Error | null = null;
    // Capture source files before script runs
    let preSourceFiles: Record<string, string> = {};

    async function captureSourceFiles(): Promise<Record<string, string>> {
      const snapshot: Record<string, string> = {};
      // For isolatedRunner, the only file typically is the script itself
      // but we can capture any files that might have been pre-staged
      try {
        const { readdir, readFile } = await import('fs/promises');
        const walk = async (current: string, prefix: string) => {
          let entries;
          try {
            entries = await readdir(current, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            const full = join(current, entry.name);
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              await walk(full, rel);
            } else if (entry.isFile() && entry.name !== fileName) {
              try {
                snapshot[rel] = await readFile(full, 'utf8');
              } catch {
                // best-effort
              }
            }
          }
        };
        await walk(scratchDir, '');
      } catch {
        // best-effort
      }
      return snapshot;
    }

    try {
      await mkdir(scratchDir, { recursive: true, mode: 0o700 });
      await writeFile(filePath, req.code, { mode: 0o600 });

      // Capture source files before execution
      preSourceFiles = await captureSourceFiles();

      span.addEvent('workspace:created', { scratchDir });

      exitCode = await new Promise<number | null>((resolve) => {
        const proc = spawn(command, [...args, filePath], {
          cwd: scratchDir,
          env: safeEnv as any,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGKILL');
        }, timeoutMs);

        proc.stdout?.on('data', (data) => {
          if (stdout.length < MAX_BUFFER_SIZE) {
            stdout += data.toString();
          }
        });

        proc.stderr?.on('data', (data) => {
          if (stderr.length < MAX_BUFFER_SIZE) {
            stderr += data.toString();
          }
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve(code);
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          stderr += `\n[Execution Error]: ${err.message}`;
          resolve(1);
        });
      });

      const { durationMs } = span.end({
        output: { exitCode, timedOut, stdout: stdout.slice(0, 500) },
        metadata: { timedOut, exitCode },
      });

      const result: ExecutionResult = {
        executionId,
        exitCode: timedOut ? 124 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        durationMs,
      };

      // Build and emit ExecutionTrace (fire-and-forget)
      const traceExitCode = executionError ? null : (exitCode === null ? null : (timedOut ? 124 : exitCode));
      const effectiveResult = executionError
        ? { exitCode: null, stdout: stdout.trim(), stderr: stderr.trim(), timedOut, durationMs: 0 }
        : { exitCode: timedOut ? 124 : exitCode, stdout: stdout.trim(), stderr: stderr.trim(), timedOut, durationMs: 0 };

      const trace: ExecutionTrace = {
        traceId: req.traceId || executionId,
        sessionId: executionId,
        workspaceId,
        userId,
        s_x: {
          sourceFiles: preSourceFiles,
          astFingerprint: '',
          embedding: null,
        },
        action: {
          type: 'execute',
          command: req.code,
          language: req.language,
          metadata: {
            executionId,
          },
        },
        s_y: {
          ...effectiveResult,
          artifacts: [],
          embedding: null,
        },
        timestamp: new Date().toISOString(),
      };

      // Fire-and-forget emission
      (async () => { await this.traceEmitterRef.emit(trace); })().catch(() => {});

      return result;
    } catch (error: any) {
      span.fail(error, { scratchDir });
      executionError = error;
      throw error;
    } finally {
      // Guaranteed scratch workspace cleanup
      await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private resolveRuntime(language: ExecutionRequest['language']): {
    command: string;
    args: string[];
    fileName: string;
  } {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return { command: 'node', args: ['--no-warnings'], fileName: 'script.js' };
      case 'python':
        return { command: 'python3', args: ['-B'], fileName: 'script.py' };
      case 'sh':
        return { command: 'sh', args: ['-e'], fileName: 'script.sh' };
      default:
        throw new Error(`Unsupported sandbox runtime: ${language}`);
    }
  }

  private buildSandboxEnvironment(
    userEnv: Record<string, string> | undefined,
    executionId: string,
  ): Record<string, string> {
    const allowedFromHost = new Set(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SHELL', 'NODE_ENV']);
    const env: Record<string, string> = { LATTICE_SANDBOX_ID: executionId };

    for (const key of allowedFromHost) {
      const value = process.env[key];
      if (value) env[key] = value;
    }

    if (userEnv) {
      for (const [key, value] of Object.entries(userEnv)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          env[key] = value.trim();
        }
      }
    }

    return env;
  }
}

export const isolatedRunner = new IsolatedRunner();
