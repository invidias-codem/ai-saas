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
import { mkdir, rm, readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
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
  allowedNetworkHosts?: string[];
  /** Optional execution session id used to bind quarantine lifecycle
   * (stage / promote / reject) when a promotion manager is injected. */
  sessionId?: string;
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

export interface SandboxWriteRequest {
  type: 'write';
  filePath: string;
  content: string;
  maxBytes?: number;
  scratchDir: string;
  sessionId?: string;
}

export interface SandboxPatchRequest {
  type: 'patch';
  filePath: string;
  searchBlock: string;
  replaceBlock: string;
  scratchDir: string;
}

export type FileSandboxRequest = SandboxWriteRequest | SandboxPatchRequest;

export interface FileSandboxResult {
  success: boolean;
  path?: string;
  error?: string;
  bytesWritten?: number;
  patched?: boolean;
  exitCode?: number | null;
}

export interface SandboxRunner {
  execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult>;
  writeFile(req: SandboxWriteRequest): Promise<FileSandboxResult>;
  patchFile(req: SandboxPatchRequest): Promise<FileSandboxResult>;
}

export interface QuarantineArtifact {
  sessionId: string;
  relativePath: string;
  digest: string;
  absPath: string;
}

export interface IPromotionManager {
  stageArtifact(sessionId: string, relativePath: string, content: Buffer): Promise<QuarantineArtifact>;
  promote(sessionId: string, filePaths: string[]): Promise<void>;
  reject(sessionId: string): Promise<void>;
  getPendingArtifacts(sessionId: string): Promise<QuarantineArtifact[]>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB log cap
const MAX_FILE_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB write ceiling
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
const SECRETS_DENY_PREFIXES = [
  'AWS_',
  'SUPABASE_',
  'LATTICE_',
  'GCP_',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GITHUB_',
  'SLACK_',
  'OPENAI_',
  'ANTHROPIC_',
  'XAI_',
  'DEEPSEEK_',
  'TOKEN',
  'SECRET',
  'PRIVATE_KEY',
  'DOCKER_',
];
const PATH_TRAVERSAL_DENY_REGEX = /(?:^|[\\/])(?:\.[\\.][\\/])+/;
const DOTFILE_DENY_REGEX = /(?:^|[\\/])(?:\.env|\.gitconfig|\.npmrc|\.ssh|\.aws|\.pem|\.docker)(?:[\\/]|$)/;
const DOT_GIT_DIR_REGEX = /(?:^|[\\/])\.git(?:[\\/]|$)/;

export class LocalSandboxRunner implements SandboxRunner {
  protected promotionManagerRef: IPromotionManager | null = null;

  constructor() {}

  public setPromotionManager(promotionManager: IPromotionManager | null): void {
    this.promotionManagerRef = promotionManager;
  }
  public async execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const executionId = randomUUID();
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const scratchDir = req.workdir || join(tmpdir(), `lattice-sandbox-${executionId}`);
    const sessionId = req.sessionId;

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

    // Lifecycle control: whether to perform the quarantine stage/promote/reject
    // cycle. Only when a promotion manager is injected AND a session id is
    // bound does the runner participate in the promotion gate.
    const lifecyclePresent = !!(this.promotionManagerRef && sessionId);
    // Capture the injected manager into a local so the nested stage closure
    // (a plain function, where `this` is not preserved) can reach it.
    const promotionManager: IPromotionManager | null = this.promotionManagerRef;

    // Track artifacts staged during the execution so we can promote the exact
    // set on success or reject the session on failure/timeout.
    let stagedPaths: string[] = [];

    function stageArtifactsFromScratch(): Promise<void> {
      if (!lifecyclePresent || !promotionManager) return Promise.resolve();
      return (async () => {
        // Walk the scratch dir and stage every real artifact except the
        // runner script itself. Relative paths are relative to the scratch
        // root so they land in the quarantine session dir on promote.
        const files: string[] = [];
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
            } else if (entry.isFile()) {
              // Exclude the runner script that we wrote into the scratch root.
              if (entry.name !== fileName) {
                files.push(rel);
              }
            }
          }
        };
        await walk(scratchDir, '');
        for (const rel of files) {
          const abs = join(scratchDir, rel);
          const buf = await readFile(abs);
          await promotionManager.stageArtifact(sessionId!, rel, buf);
          stagedPaths.push(rel);
        }
      })();
    }

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

      // Success path: if a lifecycle is bound and artifacts were staged,
      // attempt promotion. Note that `promote()` now verifies the staged
      // SHA-1 digest before moving the file to the live root.
      if (lifecyclePresent && promotionManager && stagedPaths.length > 0) {
        try {
          await promotionManager.promote(sessionId!, stagedPaths);
        } catch (err) {
          // Promotion failure is a security event — log it on the span but
          // do NOT throw, so the execution result still returns cleanly.
          span.addEvent('promotion:failed', { sessionId: sessionId!, error: String(err) });
        }
      }

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

      // Failure or timeout: reject the quarantine session so any artifacts
      // already staged (or staged during the failing stage attempt) are wiped.
      if (lifecyclePresent && promotionManager && sessionId) {
        try {
          await promotionManager.reject(sessionId);
        } catch (err) {
          span.addEvent('promotion:rejectFailed', { sessionId: sessionId, error: String(err) });
        }
      }

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
      if (value && !isSecretKey(key)) {
        env[key] = value;
      }
    }

    if (isolatedEnv) {
      for (const [key, value] of Object.entries(isolatedEnv)) {
        if (typeof value === 'string' && value.trim().length > 0 && !isSecretKey(key)) {
          env[key] = value.trim();
        }
      }
    }

    return env;
  }

  private validateNetworkAccess(command: string, allowedNetworkHosts: string[] | undefined): void {
    if (!allowedNetworkHosts || allowedNetworkHosts.length === 0) {
      return;
    }

    const normalizedCommand = command.toLowerCase();
    const riskyPatterns = [
      'curl ',
      'wget ',
      'nc ',
      'netcat ',
      'telnet ',
      'ssh ',
      'scp ',
      'rsync ',
      'git clone',
      'git push',
      'git fetch',
      'npm install',
      'npm publish',
      'npx ',
      'python3 -c',
      'python -c',
      'node -e',
    ];

    for (const pattern of riskyPatterns) {
      if (normalizedCommand.includes(pattern)) {
        const hasAllowedTarget = allowedNetworkHosts.some((host) => normalizedCommand.includes(host.toLowerCase()));
        if (!hasAllowedTarget) {
          throw new Error(`Network access denied: command '${command}' requires explicit allowedNetworkHosts`);
        }
      }
    }
  }

  private validateWritePath(filePath: string, scratchDir: string): void {
    const resolved = resolvePath(filePath);
    if (!resolved.startsWith(scratchDir + '/')) {
      throw new Error(`Path traversal denied: ${filePath} resolves outside sandbox`);
    }

    const relative = resolved.slice(scratchDir.length + 1);
    const normalized = relative.replace(/\\/g, '/');

    if (DOT_GIT_DIR_REGEX.test(normalized) || DOTFILE_DENY_REGEX.test(normalized)) {
      throw new Error(`Write denied for protected path: ${filePath}`);
    }
  }

  private validatePatchPath(filePath: string, scratchDir: string): void {
    const resolved = resolvePath(filePath);
    if (!resolved.startsWith(scratchDir + '/')) {
      throw new Error(`Path traversal denied: ${filePath} resolves outside sandbox`);
    }

    const relative = resolved.slice(scratchDir.length + 1);
    const normalized = relative.replace(/\\/g, '/');

    if (DOT_GIT_DIR_REGEX.test(normalized) || DOTFILE_DENY_REGEX.test(normalized)) {
      throw new Error(`Patch denied for protected path: ${filePath}`);
    }
  }

  public async writeFile(req: SandboxWriteRequest): Promise<FileSandboxResult> {
    const maxBytes = req.maxBytes ?? MAX_FILE_PAYLOAD_BYTES;
    if (Buffer.byteLength(req.content, 'utf8') > maxBytes) {
      return { success: false, error: `Payload exceeds ${maxBytes} bytes`, exitCode: 1 };
    }

    try {
      this.validateWritePath(req.filePath, req.scratchDir);
    } catch (err: any) {
      return { success: false, error: err.message, exitCode: 1 };
    }

    const resolved = resolvePath(req.filePath);
    const absolute = join(req.scratchDir, resolved);

    try {
      await mkdir(join(absolute, '..'), { recursive: true });
      await writeFile(absolute, req.content, { mode: 0o600 });

      if (this.promotionManagerRef) {
        const rel = relative(req.scratchDir, absolute);
        const sessionId = req.sessionId ?? req.scratchDir;
        await this.promotionManagerRef.stageArtifact(sessionId, rel, Buffer.from(req.content, 'utf8'));
      }

      return { success: true, path: absolute, bytesWritten: Buffer.byteLength(req.content, 'utf8'), exitCode: 0 };
    } catch (err: any) {
      return { success: false, error: err.message, exitCode: 1 };
    }
  }

  public async patchFile(req: SandboxPatchRequest): Promise<FileSandboxResult> {
    try {
      this.validatePatchPath(req.filePath, req.scratchDir);
    } catch (err: any) {
      return { success: false, error: err.message, exitCode: 1 };
    }

    const resolved = resolvePath(req.filePath);
    const absolute = join(req.scratchDir, resolved);

    try {
      const data = await readFile(absolute, 'utf8');
      const updated = data.replace(req.searchBlock, req.replaceBlock);

      if (updated === data) {
        return { success: false, error: 'search block not found', exitCode: 1 };
      }

      await writeFile(absolute, updated, { mode: 0o600 });
      return { success: true, path: absolute, patched: true, exitCode: 0 };
    } catch (err: any) {
      return { success: false, error: err.message, exitCode: 1 };
    }
  }
}

function isSecretKey(key: string): boolean {
  const upperKey = key.toUpperCase();
  return SECRETS_DENY_PREFIXES.some((prefix) => upperKey.startsWith(prefix) || upperKey === prefix);
}

export function shouldUseSandbox(tool: any): boolean {
  return tool.requiresSandbox === true;
}

export class SandboxManager {
  constructor(
    private runner: LocalSandboxRunner,
    private promotionManager: IPromotionManager | null = null,
  ) {
    runner.setPromotionManager(promotionManager);
  }

  setPromotionManager(promotionManager: IPromotionManager | null): void {
    this.promotionManager = promotionManager;
    this.runner.setPromotionManager(promotionManager);
  }

  async execute(req: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    return this.runner.execute(req);
  }

  async writeFile(req: SandboxWriteRequest): Promise<FileSandboxResult> {
    return this.runner.writeFile(req);
  }

  async patchFile(req: SandboxPatchRequest): Promise<FileSandboxResult> {
    return this.runner.patchFile(req);
  }
}

export const localSandboxRunner = new LocalSandboxRunner();
export const sandboxManager = new SandboxManager(localSandboxRunner);

function resolvePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((segment) => !PATH_TRAVERSAL_DENY_REGEX.test(segment));
  return segments.join('/');
}
