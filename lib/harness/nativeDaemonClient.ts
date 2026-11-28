import { randomBytes } from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import { z } from 'zod';
import type { ToolExecutionResult } from './types';

const startupTimeoutMs = 5000;
const requestTimeoutMs = 30000;
const maxHandshakeBytes = 4096;
const maxResponseBytes = 2 * 1024 * 1024;

const resultSchema = z.object({
  ok: z.boolean(), output: z.string().optional(), error: z.string().optional(),
  code: z.string().optional(), data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
}).refine(result => result.ok || typeof result.error === 'string');
const responseSchema = z.object({
  jsonrpc: z.literal('2.0'), id: z.string(), result: resultSchema.optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
}).refine(value => Boolean(value.result) !== Boolean(value.error));

function daemonError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw daemonError('DAEMON_PROTOCOL_ERROR', 'Daemon response body is missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) { cancel(); throw signal.reason; }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) {
        cancel();
        throw daemonError('DAEMON_RESPONSE_LIMIT', 'Daemon response exceeds 2 MiB');
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw daemonError('DAEMON_PROTOCOL_ERROR', 'Daemon response is not valid JSON');
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Owns one daemon session. Mutation requests are never retried automatically. */
export class NativeDaemonClient {
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private authToken = '';
  private generation = 0;
  private initialization: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private cancelStartup: (() => void) | null = null;
  private readonly pending = new Set<AbortController>();
  private requestId = 0;

  constructor(private readonly workspaceRoot: string) {}

  public initialize(paths: string[]): Promise<void> {
    if (this.port !== null) return Promise.resolve();
    if (this.initialization) return this.initialization;
    const generation = ++this.generation;
    const initializing = this.start(paths, generation).finally(() => {
      if (this.initialization === initializing) this.initialization = null;
    });
    this.initialization = initializing;
    return initializing;
  }

  private async start(paths: string[], generation: number): Promise<void> {
    if (this.closing) await this.closing;
    let binary: string | undefined;
    for (const candidate of paths) {
      try {
        await fs.access(candidate, fs.constants.X_OK);
        binary = candidate;
        break;
      } catch { /* try the next installed location */ }
    }
    if (generation !== this.generation) throw daemonError('DAEMON_DOWN', 'Daemon startup cancelled');
    if (!binary) throw daemonError('DAEMON_DOWN', 'Native harness executable is unavailable');
    this.authToken = randomBytes(32).toString('hex');
    const child = spawn(binary, ['--port=0'], {
      cwd: this.workspaceRoot,
      env: { ...process.env, LATTICE_AUTH_TOKEN: this.authToken },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let buffer = '';
      const current = () => this.child === child && this.generation === generation;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.cancelStartup = null;
        if (error) {
          if (current()) { this.child = null; this.port = null; }
          child.kill('SIGKILL');
          reject(error);
        } else resolve();
      };
      const timer = setTimeout(() => finish(daemonError('DAEMON_DOWN', 'Daemon startup timed out')), startupTimeoutMs);
      this.cancelStartup = () => finish(daemonError('DAEMON_DOWN', 'Daemon startup cancelled'));
      child.stdout?.on('data', (chunk: Buffer) => {
        if (settled || !current()) return;
        if (Buffer.byteLength(buffer) + chunk.byteLength > maxHandshakeBytes) {
          finish(daemonError('DAEMON_PROTOCOL_ERROR', 'Daemon handshake exceeds size limit'));
          return;
        }
        buffer += chunk.toString('utf8');
        const end = buffer.indexOf('\n');
        if (end < 0) return;
        try {
          const ready = JSON.parse(buffer.slice(0, end));
          if (ready.status !== 'ready' || !Number.isInteger(ready.port) || ready.port < 1 || ready.port > 65535) throw new Error();
          this.port = ready.port;
          finish();
        } catch {
          finish(daemonError('DAEMON_PROTOCOL_ERROR', 'Invalid daemon handshake'));
        }
      });
      // Always drain stderr without forwarding arbitrary daemon text to logs.
      child.stderr?.on('data', () => {});
      const closed = () => {
        if (!current()) return;
        this.port = null;
        this.child = null;
        this.abortRequests();
        finish(daemonError('DAEMON_DOWN', 'Daemon closed before startup completed'));
      };
      child.on('error', closed);
      child.on('close', closed);
    });
  }

  private abortRequests() {
    for (const controller of this.pending) controller.abort(daemonError('DAEMON_DOWN', 'Daemon session ended'));
  }

  public async request(action: string, inputs: Record<string, unknown>): Promise<ToolExecutionResult> {
    const port = this.port;
    if (port === null) return { ok: false, error: 'Native daemon is unavailable', code: 'DAEMON_DOWN' };
    const id = `req_${++this.requestId}`;
    const requested = Number(inputs.timeout_seconds);
    const commandSeconds = Number.isFinite(requested) && requested > 0 ? Math.min(120, requested) : 30;
    const timeout = action === 'execute_command_secure'
      ? commandSeconds * 1000 + 5000
      : requestTimeoutMs;
    const controller = new AbortController();
    this.pending.add(controller);
    const timer = setTimeout(() => controller.abort(daemonError('DAEMON_TIMEOUT', 'Daemon request timed out')), timeout);
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const perform = async (): Promise<ToolExecutionResult> => {
      const response = await fetch(`http://127.0.0.1:${port}/rpc`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ id, jsonrpc: '2.0', authToken: this.authToken, workspaceRoot: this.workspaceRoot, action, inputs }),
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { ok: false, error: `HTTP ${response.status} from daemon`, code: 'DAEMON_HTTP_ERROR' };
      }
      const parsed = responseSchema.safeParse(await readResponse(response, controller.signal));
      if (!parsed.success || parsed.data.id !== id) throw daemonError('DAEMON_PROTOCOL_ERROR', 'Invalid or mismatched daemon response');
      if (parsed.data.error) return { ok: false, error: parsed.data.error.message, code: 'DAEMON_RPC_ERROR' };
      const result = parsed.data.result!;
      const meta = result.meta ?? result.data;
      return result.ok
        ? { ...result, ok: true, output: result.output ?? '', meta }
        : { ...result, ok: false, error: result.error!, meta };
    };
    try {
      return await Promise.race([perform(), aborted]);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Daemon request failed');
      const code = 'code' in failure && typeof failure.code === 'string' && failure.code.startsWith('DAEMON_')
        ? failure.code : 'DAEMON_NETWORK_ERROR';
      return { ok: false, error: failure.message, code };
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onAbort);
      this.pending.delete(controller);
    }
  }

  public shutdown(): Promise<void> {
    const child = this.child;
    const cancelStartup = this.cancelStartup;
    ++this.generation;
    this.initialization = null;
    this.port = null;
    this.abortRequests();
    this.child = null;
    if (!child) {
      cancelStartup?.();
      return this.closing ?? Promise.resolve();
    }
    const closing = new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 5000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      cancelStartup?.();
      if (!child.killed) child.kill('SIGTERM');
    }).finally(() => { if (this.closing === closing) this.closing = null; });
    this.closing = closing;
    return closing;
  }
}
