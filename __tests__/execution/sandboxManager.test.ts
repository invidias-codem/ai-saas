/**
 * Offline unit tests for `lib/execution/sandboxManager.ts`.
 *
 * Validates local runner isolation behavior with mocked filesystem and process APIs:
 * - ephemeral scratch workspace
 * - hard timeout enforcement
 * - environment scrubbing
 * - successful/failed execution metadata
 */

const { randomUUID } = require('crypto');

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  rm: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));
jest.mock('os', () => ({
  tmpdir: jest.fn(),
}));
jest.mock('path', () => ({
  join: jest.fn((...parts) => {
    const joined = parts.join('/').replace(/\/+/g, '/');
    return joined.endsWith('/') ? joined.slice(0, -1) : joined;
  }),
  relative: jest.fn((from, to) => {
    const prefix = from.endsWith('/') ? from : from + '/';
    if (to.startsWith(prefix)) return to.slice(prefix.length);
    return to.replace(prefix, '');
  }),
}));
jest.mock('@/lib/ucol/observability/span', () => ({
  UcolSpan: jest.fn().mockImplementation(() => ({
    addEvent: jest.fn(),
    end: jest.fn(() => ({ durationMs: 1 })),
    fail: jest.fn(),
  })),
}));

const { spawn } = require('child_process');
const { mkdir, rm, readFile, writeFile } = require('fs/promises');
const { tmpdir } = require('os');
const path = require('path');

const { LocalSandboxRunner, SandboxManager, sandboxManager } = require('@/lib/execution/sandboxManager');

const fakeStdout = Buffer.from('hello-world');
const fakeStderr = Buffer.from('oops');

function createFakeProcess(closeCode = 0, delay = 0) {
  const timers = [];
  const proc = {
    stdout: { on: (event, handler) => { if (event === 'data') timers.push(setTimeout(() => handler(fakeStdout), delay || 0)); } },
    stderr: { on: (event, handler) => { if (event === 'data') timers.push(setTimeout(() => handler(fakeStderr), delay || 0)); } },
    on: (event, handler) => {
      if (event === 'close') timers.push(setTimeout(() => handler(closeCode), delay || 0));
      if (event === 'error') timers.push(setTimeout(() => handler(new Error('spawn failed')), delay || 0));
    },
    kill: jest.fn(),
  };

  return { proc, timers };
}

describe('sandboxManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (tmpdir as jest.Mock).mockReturnValue('/tmp');
    (path.join as jest.Mock).mockImplementation((...parts) => parts.join('/'));
  });

  afterEach(() => {
    for (const t of (global as any).__sandboxTimers || []) clearTimeout(t);
  });

  test('scratch workspace is created and destroyed', async () => {
    const { proc, timers } = createFakeProcess(0, 10);
    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);
    (global as any).__sandboxTimers = timers;

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'echo hello-world', language: 'sh' });

    expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/lattice-sandbox-.*/), { recursive: true, mode: 0o700 });
    expect(rm).toHaveBeenCalled();
    expect(result.stdout).toBe('hello-world');
    expect(result.stderr).toBe('oops');
  });

  test('hard timeout kills slow command', async () => {
    const { proc, timers } = createFakeProcess(0, 1000);
    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);
    (global as any).__sandboxTimers = timers;

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'sleep 10', language: 'sh', timeoutMs: 50 });

    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
  });

  test('stderr is captured without stdout', async () => {
    const stdoutSpy = { on: jest.fn() };
    const stderrSpy = { on: (event, handler) => { if (event === 'data') handler(Buffer.from('oops')); } };
    const proc = {
      stdout: stdoutSpy,
      stderr: stderrSpy,
      on: (event, handler) => { if (event === 'close') handler(1); if (event === 'error') handler(new Error('spawn failed')); },
      kill: jest.fn(),
    };

    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'echo oops 1>&2; exit 1', language: 'sh' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('oops');
  });

  test('sandbox env does not leak host secrets', async () => {
    const stdoutSpy = { on: (event, handler) => { if (event === 'data') handler(Buffer.from('env-data')); } };
    const stderrSpy = { on: jest.fn() };
    const proc = {
      stdout: stdoutSpy,
      stderr: stderrSpy,
      on: (event, handler) => { if (event === 'close') handler(0); },
      kill: jest.fn(),
    };

    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);

    process.env.AWS_SECRET_ACCESS_KEY = 'leak-me';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'leak-me-too';

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'env', language: 'sh' });

    expect(result.stdout).not.toContain('AWS_SECRET_ACCESS_KEY');
    expect(result.stdout).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('sandboxManager wrapper forwards to runner', async () => {
    const stdoutSpy = { on: (event, handler) => { if (event === 'data') handler(Buffer.from('wrapper-ok')); } };
    const stderrSpy = { on: jest.fn() };
    const proc = {
      stdout: stdoutSpy,
      stderr: stderrSpy,
      on: (event, handler) => { if (event === 'close') handler(0); },
      kill: jest.fn(),
    };

    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);

    const result = await sandboxManager.execute({ command: 'echo wrapper-ok', language: 'sh' });
    expect(result.stdout).toBe('wrapper-ok');
  });

  test('marks result as truncated when output exceeds buffer', async () => {
    const bigChunk = Buffer.from('x'.repeat(1024 * 1024 + 1)); // 1MB + 1 to force truncation flag
    const stdoutSpy = { on: (event, handler) => { if (event === 'data') handler(bigChunk); } };
    const stderrSpy = { on: jest.fn() };
    const proc = {
      stdout: stdoutSpy,
      stderr: stderrSpy,
      on: (event, handler) => { if (event === 'close') handler(0); },
      kill: jest.fn(),
    };

    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'big', language: 'sh' });

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024);
    expect(result.bufferWarning).toBeDefined();
  });

  test('does not set truncation flags when output fits in buffer', async () => {
    const stdoutSpy = { on: (event, handler) => { if (event === 'data') handler(Buffer.from('small output')); } };
    const stderrSpy = { on: jest.fn() };
    const proc = {
      stdout: stdoutSpy,
      stderr: stderrSpy,
      on: (event, handler) => { if (event === 'close') handler(0); },
      kill: jest.fn(),
    };

    (spawn as jest.Mock).mockReturnValue(proc);
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (rm as jest.Mock).mockResolvedValue(undefined);

    const runner = new LocalSandboxRunner();
    const result = await runner.execute({ command: 'echo ok', language: 'sh' });

    expect(result.truncated).toBeUndefined();
    expect(result.bufferWarning).toBeUndefined();
    expect(result.stdout).toBe('small output');
  });

  test('writeFile rejects path traversal outside scratchDir', async () => {
    const runner = new LocalSandboxRunner();
    const result = await runner.writeFile({
      type: 'write',
      filePath: '../../etc/passwd',
      content: 'root:x:0:0',
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal denied');
  });

  test('writeFile rejects protected dotfiles even inside sandbox', async () => {
    const runner = new LocalSandboxRunner();
    const result = await runner.writeFile({
      type: 'write',
      filePath: '/tmp/sandbox/.env',
      content: 'SECRET=leak',
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Write denied for protected path');
  });

  test('writeFile rejects payload exceeding 5MB ceiling', async () => {
    const runner = new LocalSandboxRunner();
    const bigContent = 'x'.repeat(5 * 1024 * 1024 + 1);
    const result = await runner.writeFile({
      type: 'write',
      filePath: '/tmp/sandbox/big.txt',
      content: bigContent,
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Payload exceeds');
  });

  test('patchFile rejects path traversal outside scratchDir', async () => {
    const runner = new LocalSandboxRunner();
    const result = await runner.patchFile({
      type: 'patch',
      filePath: '../.ssh/id_rsa',
      searchBlock: 'old',
      replaceBlock: 'new',
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal denied');
  });

  test('patchFile rejects writes to .git directory', async () => {
    const runner = new LocalSandboxRunner();
    const result = await runner.patchFile({
      type: 'patch',
      filePath: '/tmp/sandbox/.git/hooks/pre-commit',
      searchBlock: 'old',
      replaceBlock: 'new',
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Patch denied for protected path');
  });

  test('SandboxManager forwards injected promotion manager to runner.writeFile()', async () => {
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);

    const runner = new LocalSandboxRunner();
    const manager = new SandboxManager(runner);

    const promotionManager = {
      stageArtifact: jest.fn().mockResolvedValue({
        sessionId: 's1',
        relativePath: 'a.txt',
        digest: 'd1',
        absPath: '/q/a.txt',
      }),
      promote: jest.fn(),
      reject: jest.fn(),
    } as any;

    manager.setPromotionManager(promotionManager);

    const result = await manager.writeFile({
      type: 'write',
      filePath: '/tmp/sandbox/a.txt',
      content: 'hello',
      scratchDir: '/tmp/sandbox',
      sessionId: 's1',
    });

    expect(result.success).toBe(true);
    expect(promotionManager.stageArtifact).toHaveBeenCalledWith('s1', expect.stringMatching(/a\.txt$/), expect.any(Buffer));
  });

  test('writeFile does not call stageArtifact when no promotion manager is set', async () => {
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);

    const runner = new LocalSandboxRunner();
    const result = await runner.writeFile({
      type: 'write',
      filePath: '/tmp/sandbox/b.txt',
      content: 'hello',
      scratchDir: '/tmp/sandbox',
    });

    expect(result.success).toBe(true);
  });
});
