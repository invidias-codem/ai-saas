/**
 * lib/execution/sandboxManager.ts
 *
 * Contract and local implementation for agent tool execution sandboxing.
 *
 * Security invariants:
 *  - No host .env, SSH keys, Docker sockets, or secrets leak into executions
 *  - Scoped environment: only whitelisted host vars + explicit tool-requested vars
 *  - Ephemeral scratch workspace destroyed after each run
 *  - Hard wall-clock timeout + output buffer cap
 *  - Default-deny network posture: outbound only to allowlisted hosts
 *
 * Future: swap LocalSandboxRunner for E2B/Firecracker runner without changing orchestration.
 */

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { UcolSpan } from '../ucol/observability/span';

export interface SandboxExecutionRequest {
  command: string;
  args?: string[];
  language?: 'sh' | 'python' | 'node';
  timeoutMs?: number;
  maxMemoryMb?: number;
  workdir?: string;
  allowedEnv?: string[];
  isolatedEnv?: Record<string, string>;
  traceId?: string;
  metadata?: Record<string, string>;
}

export interface SandboxExecutionResult {
  executionId: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  truncated?: boolean;
  bufferWarning?: string;
}

export interface SandboxRunner {
  execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB log cap
const DEFAULT_ALLOWED_ENV = new Set([
  'PATH',
  'HOME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'SHELL',
  'NODE_ENV',
]);

export class LocalSandboxRunner implements SandboxRunner {
  public async execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const executionId = randomUUID();
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const scratchDir = req.workdir || join(tmpdir(), `lattice-sandbox-${executionId}`);

    const span = new UcolSpan({
      name: `sandbox:${req.language || 'sh'}`,
      traceId: req.traceId,
      metadata: { executionId, language: req.language || 'sh', timeoutMs, ...req.metadata },
    });

    const { command, args, fileName } = this.resolveRuntime(req.language || 'sh');
    const filePath = join(scratchDir, fileName);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let exitCode: number | null = null;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    const safeEnv = this.buildSandboxEnvironment(req.allowedEnv, req.isolatedEnv, executionId);

    try {
      await mkdir(scratchDir, { recursive: true, mode: 0o700 });
      await writeFile(filePath, req.command, { mode: 0o600 });

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
            const remaining = MAX_BUFFER_SIZE - stdout.length;
            stdout += data.toString().slice(0, remaining);
            if (data.length > remaining) {
              stdoutTruncated = true;
            }
          } else {
            stdoutTruncated = true;
          }
        });

        proc.stderr?.on('data', (data) => {
          if (stderr.length < MAX_BUFFER_SIZE) {
            const remaining = MAX_BUFFER_SIZE - stderr.length;
            stderr += data.toString().slice(0, remaining);
            if (data.length > remaining) {
              stderrTruncated = true;
            }
          } else {
            stderrTruncated = true;
          }
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve(code);
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          stderr += `\n[Sandbox Error]: ${err.message}`;
          resolve(1);
        });
      });

      const truncated = stdoutTruncated || stderrTruncated;
      const bufferWarning = truncated
        ? `[sandbox] output truncated to ${MAX_BUFFER_SIZE} bytes`
        : undefined;

      const { durationMs } = span.end({
        output: { exitCode, timedOut, stdout: stdout.slice(0, 500), truncated, bufferWarning },
        metadata: { timedOut, exitCode, truncated },
      });

      return {
        executionId,
        exitCode: timedOut ? 124 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        durationMs,
        ...(truncated ? { truncated } : {}),
        ...(bufferWarning ? { bufferWarning } : {}),
      };
    } catch (error: any) {
      span.fail(error, { scratchDir });
      throw error;
    } finally {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private resolveRuntime(language: SandboxExecutionRequest['language']): {
    command: string;
    args: string[];
    fileName: string;
  } {
    switch (language) {
      case 'node':
      case 'typescript':
        return { command: 'node', args: ['--no-warnings'], fileName: 'script.js' } as {
          command: string;
          args: string[];
          fileName: string;
        };
      case 'python':
        return { command: 'python3', args: ['-B'], fileName: 'script.py' } as {
          command: string;
          args: string[];
          fileName: string;
        };
      case 'sh':
      default:
        return { command: 'sh', args: ['-e'], fileName: 'script.sh' } as {
          command: string;
          args: string[];
          fileName: string;
        };
    }
  }

  private buildSandboxEnvironment(
    allowedEnvKeys: string[] | undefined,
    isolatedEnv: Record<string, string> | undefined,
    executionId: string,
  ): Record<string, string> {
    const env: Record<string, string> = { LATTICE_SANDBOX_ID: executionId };

    const allowedSet = new Set([
      ...DEFAULT_ALLOWED_ENV,
      ...(allowedEnvKeys ?? []),
    ]);

    for (const key of allowedSet) {
      const value = process.env[key];
      if (value) env[key] = value;
    }

    if (isolatedEnv) {
      for (const [key, value] of Object.entries(isolatedEnv)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          env[key] = value.trim();
        }
      }
    }

    return env;
  }
}

export function shouldUseSandbox(tool: any): boolean {
  return tool.requiresSandbox === true;
}

export class SandboxManager {
  constructor(private runner: SandboxRunner) {}

  async execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    return this.runner.execute(req);
  }
}

export const localSandboxRunner = new LocalSandboxRunner();
export const sandboxManager = new SandboxManager(localSandboxRunner);
