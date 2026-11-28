import { jest } from '@jest/globals';

const originalConsoleError = console.error;

function silentConsoleError() {
  console.error = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes('vault.decrypted_secrets')) return;
    originalConsoleError(...args);
  };
}

describe.skip('lattice-cli entrypoint', () => {
  let modulePath: string;

  beforeEach(() => {
    silentConsoleError();
    jest.resetModules();
    modulePath = require.resolve('/Users/jjem/Projects/ai-saas/scripts/lattice-cli.mjs');
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('exits with usage when no args are provided', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [modulePath], {
      stdio: 'pipe',
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    await new Promise((resolve) => child.on('exit', resolve));
    expect(child.exitCode).toBe(0);
    expect(stdout).toContain('usage:');
  });

  it('prints help for unknown command', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [modulePath, 'mystery'], {
      stdio: 'pipe',
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    await new Promise((resolve) => child.on('exit', resolve));
    expect(child.exitCode).toBe(2);
    expect(stderr).toContain('unknown command: mystery');
  });

  it('requires auth for prompt', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [modulePath, 'prompt', 'hello'], {
      stdio: 'pipe',
      env: { ...process.env, LATTICE_API_URL: 'http://localhost:3000' },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    await new Promise((resolve) => child.on('exit', resolve));
    expect(child.exitCode).toBe(1);
    expect(stderr).toContain('missing auth: set LATTICE_CLI_TOKEN or LATTICE_TOKEN');
  });

  it('doctor checks health and masked bearer', async () => {
    const { spawn } = await import('node:child_process');
    const child = spawn('node', [modulePath, 'doctor'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        LATTICE_API_URL: 'http://localhost:3000',
        LATTICE_TOKEN: '1234567890abcdef1234567890abcdef',
        LATTICE_USER_ID: 'test-user',
      },
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    await new Promise((resolve) => child.on('exit', resolve));
    expect(child.exitCode).toBe(0);
    expect(stdout).toContain('health:');
    expect(stdout).toContain('userId=test-user');
    expect(stdout).toContain('12345...cdef');
  });
});
