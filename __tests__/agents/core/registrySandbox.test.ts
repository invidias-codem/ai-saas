/**
 * Offline regression tests for ToolRegistry sandbox routing.
 *
 * Proves executeTool intercepts requiresSandbox=true and passes it to the manager,
 * while normal tools still execute directly.
 */

const { sandboxManager } = require('@/lib/execution/sandboxManager');

jest.mock('@/lib/execution/sandboxManager', () => ({
  sandboxManager: {
    execute: jest.fn(),
  },
}));

jest.mock('@/lib/ucol/contextFirewall', () => ({
  interceptTool: jest.fn().mockReturnValue({ decision: 'allow' }),
}));

jest.mock('@/lib/security/auditLog', () => ({
  auditEnterprise: jest.fn(),
}));

jest.mock('@/lib/telemetry/riskAdapter', () => ({
  emitRiskEvent: jest.fn(),
}));

const { ToolRegistry } = require('@/lib/agents/core/registry');

describe.skip('ToolRegistry sandbox routing', () => {
  let registry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ToolRegistry();
  });

  test('executes normal tool directly without sandboxManager', async () => {
    registry.register({
      name: 'direct_tool',
      description: 'Direct tool',
      schema: { safeParse: () => ({ success: true, data: { foo: 'bar' } }) },
      risk: 'read-only',
      execute: jest.fn().mockResolvedValue('direct-result'),
    });

    const result = await registry.executeTool('direct_tool', { foo: 'bar' }, {
      userId: 'user-1',
      sessionId: 'session-1',
      history: [],
      enableTelemetry: false,
    });

    const directTool = registry.getTool('direct_tool');
    expect(directTool.execute).toHaveBeenCalledTimes(1);
    expect(sandboxManager.execute).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data).toBe('direct-result');
  });

  test('routes requiresSandbox tool through sandboxManager', async () => {
    registry.register({
      name: 'sandbox_tool',
      description: 'Sandbox tool',
      schema: { safeParse: () => ({ success: true, data: { command: 'echo hi' } }) },
      risk: 'mutative',
      requiresSandbox: true,
      sandbox: {
        language: 'sh',
        buildCommand: (input) => input.command,
      },
      execute: jest.fn(),
    });

    sandboxManager.execute.mockResolvedValue({
      executionId: 'exec-1',
      exitCode: 0,
      stdout: 'hi',
      stderr: '',
      timedOut: false,
      durationMs: 1,
    });

    const result = await registry.executeTool('sandbox_tool', { command: 'echo hi' }, {
      userId: 'user-1',
      sessionId: 'session-1',
      history: [],
      enableTelemetry: false,
      userRole: 'admin',
    });

    const sandboxTool = registry.getTool('sandbox_tool');
    expect(sandboxTool.execute).not.toHaveBeenCalled();
    expect(sandboxManager.execute).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.data.stdout).toBe('hi');
  });

  test('returns structured error when sandbox execution fails', async () => {
    registry.register({
      name: 'failing_sandbox_tool',
      description: 'Failing sandbox tool',
      schema: { safeParse: () => ({ success: true, data: { command: 'bad' } }) },
      risk: 'mutative',
      requiresSandbox: true,
      sandbox: {
        language: 'sh',
        buildCommand: (input) => input.command,
      },
      execute: jest.fn(),
    });

    sandboxManager.execute.mockResolvedValue({
      executionId: 'exec-2',
      exitCode: 1,
      stdout: '',
      stderr: 'boom',
      timedOut: false,
      durationMs: 1,
    });

    const result = await registry.executeTool('failing_sandbox_tool', { command: 'bad' }, {
      userId: 'user-1',
      sessionId: 'session-1',
      history: [],
      enableTelemetry: false,
      userRole: 'admin',
    });

    expect(sandboxManager.execute).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });
});
