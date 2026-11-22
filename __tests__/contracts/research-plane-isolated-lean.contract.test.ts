// Research Plane — R1B.1.1: Secure Execution Boundary contract tests.
//
// Validates Daytona-backed isolated Lean executor:
//   - Fail closed when DAYTONA_API_KEY not configured
//   - Container created with networkBlockAll, ephemeral, resource limits
//   - Verify.lean uploaded into container (no host filesystem access)
//   - `lean Verify.lean` executed inside container
//   - Container destroyed after execution (teardown guaranteed)
//   - Timeout → INCONCLUSIVE, non-zero exit → FAILED

jest.mock('@daytona/sdk', () => ({
  Daytona: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  env: {
    DAYTONA_API_KEY: process.env.DAYTONA_API_KEY,
    DAYTONA_API_URL: process.env.DAYTONA_API_URL ?? 'https://app.daytona.io/api',
    DAYTONA_TARGET: process.env.DAYTONA_TARGET ?? 'us',
  },
}));

import { Daytona } from '@daytona/sdk';
import { env } from '@/lib/env';
import {
  createDaytonaLeanExecutor,
  DaytonaLeanExecutor,
} from '@/lib/research/verification/isolatedLeanExecutor';

const mockCreate = jest.fn();
const mockUploadFile = jest.fn();
const mockExecuteCommand = jest.fn();
const mockDelete = jest.fn();

const mockSandbox = {
  fs: { uploadFile: mockUploadFile, downloadFile: jest.fn() },
  process: { executeCommand: mockExecuteCommand },
  delete: mockDelete,
  refreshData: jest.fn(),
  setLabels: jest.fn(),
};

function setupMockDaytona(createResult: any = mockSandbox) {
  (Daytona as jest.Mock).mockImplementation(() => ({
    create: mockCreate,
  }));
  mockCreate.mockResolvedValue(createResult);
}

function setEnvApiKey(value: string | undefined) {
  if (value === undefined) {
    delete process.env.DAYTONA_API_KEY;
  } else {
    process.env.DAYTONA_API_KEY = value;
  }
  // Re-read env after mutation (env module parses process.env at load;
  // we mock it so it reads live)
  (env as any).DAYTONA_API_KEY = value;
}

describe('R1B.1.1 — isolated Lean executor', () => {
  afterEach(() => {
    jest.clearAllMocks();
    setEnvApiKey(undefined);
  });

  it('fails closed when DAYTONA_API_KEY not configured', () => {
    expect(() => createDaytonaLeanExecutor()).toThrow(
      /DAYTONA_API_KEY not configured/,
    );
  });

  it('provisions container with isolation settings and runs Lean', async () => {
    setEnvApiKey('test-key');
    setupMockDaytona();
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      result: "'solution' does not depend on any axioms",
    });

    const executor = createDaytonaLeanExecutor();
    const result = await executor.executeLean(
      'def Target : Prop := True\ndef solution : Target := by trivial\n',
      300,
    );

    // Container created with isolation settings
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createParams = mockCreate.mock.calls[0][0];
    expect(createParams.image).toBe('ubuntu:22.04');
    expect(createParams.networkBlockAll).toBe(true);
    expect(createParams.ephemeral).toBe(true);
    expect(createParams.resources).toEqual({ cpu: 2, memory: 4, disk: 20 });
    expect(createParams.labels['lattice-purpose']).toBe('lean-verification');

    // Verify.lean uploaded to container path
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockUploadFile.mock.calls[0][1]).toBe('/Verify.lean');

    // Lean executed inside container with timeout
    expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    const execCall = mockExecuteCommand.mock.calls[0];
    expect(execCall[0]).toBe('lean /Verify.lean');
    expect(execCall[3]).toBe(300); // timeoutSec

    // Container destroyed
    expect(mockDelete).toHaveBeenCalledTimes(1);

    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('destroys container even when Lean execution fails', async () => {
    setEnvApiKey('test-key');
    setupMockDaytona();
    mockExecuteCommand.mockRejectedValue(new Error('Lean process crashed'));

    const executor = createDaytonaLeanExecutor();
    await expect(
      executor.executeLean('bad content', 300),
    ).rejects.toThrow('Lean process crashed');

    // Teardown still attempted
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('maps timeout to timedOut flag', async () => {
    setEnvApiKey('test-key');
    setupMockDaytona();
    mockExecuteCommand.mockResolvedValue({ exitCode: 124, result: '' });

    const executor = createDaytonaLeanExecutor();
    const result = await executor.executeLean('content', 300);

    expect(result.exitCode).toBe(124);
    expect(result.timedOut).toBe(true);
  });

  it('maps non-zero exit to failure output', async () => {
    setEnvApiKey('test-key');
    setupMockDaytona();
    mockExecuteCommand.mockResolvedValue({
      exitCode: 1,
      result: 'error: unknown identifier',
    });

    const executor = createDaytonaLeanExecutor();
    const result = await executor.executeLean('content', 300);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('error');
    expect(result.timedOut).toBe(false);
  });

  it('produces DaytonaLeanExecutor instance', () => {
    setEnvApiKey('test-key');
    setupMockDaytona();
    const executor = createDaytonaLeanExecutor();
    expect(executor).toBeInstanceOf(DaytonaLeanExecutor);
  });
});
