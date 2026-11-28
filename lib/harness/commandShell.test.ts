import { ExecuteCommandSchema, buildCommandSandbox } from './commandShell';
import { executeCommandTool } from '@/lib/agents/tools/executionTools';
import { runCommandTool } from '@/lib/agents/tools/harnessTools';
import { LocalIOHarness } from './LocalIOHarness';
import type { AgentContext } from '@/lib/agents/core/types';

describe('Windows execution contracts', () => {
  test('approved tool forwards the selected shell and trusted identity to the harness', async () => {
    const execute = jest.fn().mockResolvedValue({ ok: true, output: 'result' });
    const context = { workspaceId: 'company-project', userId: 'employee', ioHarness: { executeCommandSecure: execute } } as unknown as AgentContext;
    const input = ExecuteCommandSchema.parse({ command: 'Get-ChildItem', timeoutSeconds: 20, shell: 'powershell', userId: 'forged' });
    await executeCommandTool.execute(input, context);
    expect(execute).toHaveBeenCalledWith('Get-ChildItem', 20, 'company-project', 'employee', 'powershell');
    expect(executeCommandTool.requiresApproval).toBe(true);
    expect(executeCommandTool.requiresSandbox).toBe(true);
  });

  test('run-command tool preserves CMD selection after validation', async () => {
    const failure = { ok: false, error: 'exit 7', output: 'diagnostic output', meta: { code: 7 } };
    const execute = jest.fn().mockResolvedValue(failure);
    const context = { workspaceId: 'project', userId: 'user', ioHarness: { executeCommandSecure: execute } } as unknown as AgentContext;
    const result = await runCommandTool.execute(runCommandTool.schema.parse({ command: 'dir', timeoutMs: 1000, shell: 'cmd' }), context);
    expect(execute).toHaveBeenCalledWith('dir', 1, 'project', 'user', 'cmd');
    expect(result).toMatchObject({ success: false, data: failure });
  });

  test.each([{ shell: 'bash' }, { timeoutSeconds: -1 }, { timeoutSeconds: 121 }, { command: '  ' }, { command: 'echo\0bad' }])('rejects invalid execution input %j', override => {
    expect(ExecuteCommandSchema.safeParse({ command: 'echo test', timeoutSeconds: 10, ...override }).success).toBe(false);
  });

  test('a Linux quarantine cannot reinterpret a Windows script', () => {
    expect(() => buildCommandSandbox({ command: 'Get-ChildItem', shell: 'powershell' })).toThrow('native harness');
  });

  test('Node fallback refuses explicit shells instead of changing the requested runtime', async () => {
    const result = await new LocalIOHarness('.').executeCommandSecure('Get-ChildItem', 10, 'project', 'user', 'powershell');
    expect(result).toMatchObject({ ok: false, code: 'NATIVE_HARNESS_REQUIRED' });
  });
});
