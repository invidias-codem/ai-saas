import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { GoIOHarness } from './GoIOHarness';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs/promises', () => ({ access: jest.fn().mockResolvedValue(undefined), constants: { X_OK: 1 } }));

test('host attaches its launch credential and preserves failed-command diagnostics', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
  (spawn as jest.Mock).mockReturnValue(child);
  const meta = { shell: 'powershell', code: 7, isTimedOut: false };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { ok: false, output: 'diagnostic', error: 'exit 7', data: meta } }) });
  try {
    const host = new GoIOHarness('.');
    const ready = host.initialize();
    await Promise.resolve();
    child.stdout.emit('data', Buffer.from('{"status":"ready","port":43210}\n'));
    await ready;
    const result = await host.executeCommandSecure('Write-Output test; exit 7', 10, 'company-project', 'employee', 'powershell');
    const launch = (spawn as jest.Mock).mock.calls[0][2];
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(launch.env.LATTICE_AUTH_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect(request.authToken).toBe(launch.env.LATTICE_AUTH_TOKEN);
    expect(request.inputs).toMatchObject({ shell: 'powershell', user_id: 'employee', workspace_id: 'company-project' });
    expect(result).toMatchObject({ ok: false, output: 'diagnostic', meta });
  } finally {
    global.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
