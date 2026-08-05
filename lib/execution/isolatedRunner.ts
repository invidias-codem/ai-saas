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
  public async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    const executionId = randomUUID();
    const timeoutMs = req.timeoutMs || DEFAULT_TIMEOUT_MS;

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

    try {
      await mkdir(scratchDir, { recursive: true, mode: 0o700 });
      await writeFile(filePath, req.code, { mode: 0o600 });

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

      return {
        executionId,
        exitCode: timedOut ? 124 : exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
        durationMs,
      };
    } catch (error: any) {
      span.fail(error, { scratchDir });
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
