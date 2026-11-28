import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { GoIOHarness } from './GoIOHarness';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('fs/promises', () => ({ access: jest.fn().mockResolvedValue(undefined), constants: { X_OK: 1 } }));

describe('GoIOHarness lifecycle and RPC', () => {
  const originalFetch = global.fetch;
  let children: Array<ReturnType<typeof makeChild>>;
  let hosts: GoIOHarness[];

  function makeChild() {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
      kill: jest.fn().mockReturnValue(true), killed: false,
    });
    child.kill.mockImplementation(() => { child.emit('close', 0); return true; });
    return child;
  }

  function host() {
    const instance = new GoIOHarness('.');
    hosts.push(instance);
    return instance;
  }

  async function boot(instance: GoIOHarness) {
    const ready = instance.initialize();
    await Promise.resolve();
    children.at(-1)!.stdout.emit('data', Buffer.from('{"status":"ready","port":43210}\n'));
    await ready;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    children = [];
    hosts = [];
    (spawn as jest.Mock).mockImplementation(() => {
      const child = makeChild();
      children.push(child);
      return child;
    });
    global.fetch = jest.fn().mockImplementation(async (_url, options) => {
      const request = JSON.parse(options.body);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ok: true, output: 'ready' } }));
    });
  });

  afterEach(() => {
    hosts.forEach(instance => instance.shutdown());
    global.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('attaches launch credential and preserves failed-command diagnostics', async () => {
    const instance = host();
    await boot(instance);
    const meta = { shell: 'powershell', code: 7, isTimedOut: false };
    (global.fetch as jest.Mock).mockImplementation(async (_url, options) => new Response(JSON.stringify({
      jsonrpc: '2.0', id: JSON.parse(options.body).id,
      result: { ok: false, output: 'diagnostic', error: 'exit 7', data: meta },
    })));
    const result = await instance.executeCommandSecure('Write-Output test; exit 7', 10, 'project', 'employee', 'powershell');
    const launch = (spawn as jest.Mock).mock.calls[0][2];
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(launch.env.LATTICE_AUTH_TOKEN).toMatch(/^[a-f0-9]{64}$/);
    expect(request.authToken).toBe(launch.env.LATTICE_AUTH_TOKEN);
    expect(request.inputs).toMatchObject({ shell: 'powershell', user_id: 'employee', workspace_id: 'project' });
    expect(result).toMatchObject({ ok: false, output: 'diagnostic', meta });
  });

  test('concurrent initialization launches once and clears its startup timer', async () => {
    const instance = host();
    const first = instance.initialize();
    const second = instance.initialize();
    await Promise.resolve();
    children[0].stdout.emit('data', Buffer.from('{"status":"ready","port":43210}\n'));
    await Promise.all([first, second]);
    await instance.initialize();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('accepts fragmented handshake and refuses invalid ports', async () => {
    const instance = host();
    const ready = instance.initialize();
    await Promise.resolve();
    children[0].stdout.emit('data', Buffer.from('{"status":"ready",'));
    children[0].stdout.emit('data', Buffer.from('"port":43210}\n'));
    await ready;
    const invalid = host();
    const rejected = expect(invalid.initialize()).rejects.toThrow('handshake');
    await Promise.resolve();
    children[1].stdout.emit('data', Buffer.from('{"status":"ready","port":70000}\n'));
    await rejected;
    expect(children[1].kill).toHaveBeenCalled();
    expect(await invalid.readFile('file')).toMatchObject({ code: 'DAEMON_DOWN' });
  });

  test('startup timeout kills the child and ignores a late ready message', async () => {
    const instance = host();
    const rejected = expect(instance.initialize()).rejects.toThrow('startup');
    await jest.advanceTimersByTimeAsync(5001);
    await rejected;
    children[0].stdout.emit('data', Buffer.from('{"status":"ready","port":43210}\n'));
    expect(children[0].kill).toHaveBeenCalled();
    expect(await instance.readFile('file')).toMatchObject({ code: 'DAEMON_DOWN' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('bounds an unterminated handshake', async () => {
    const instance = host();
    const rejected = expect(instance.initialize()).rejects.toThrow('handshake');
    await Promise.resolve();
    children[0].stdout.emit('data', Buffer.alloc(8192, 'x'));
    await rejected;
    expect(children[0].kill).toHaveBeenCalled();
  });

  test('exit before ready rejects immediately and restart rotates the credential', async () => {
    const instance = host();
    const rejected = expect(instance.initialize()).rejects.toThrow('closed');
    await Promise.resolve();
    children[0].emit('close', 1);
    await rejected;
    await boot(instance);
    const launches = (spawn as jest.Mock).mock.calls;
    expect(launches[0][2].env.LATTICE_AUTH_TOKEN).not.toBe(launches[1][2].env.LATTICE_AUTH_TOKEN);
    children[0].emit('close', 1);
    expect(await instance.readFile('file')).toMatchObject({ ok: true });
  });

  test('stalled RPC is aborted, never retried, and releases its deadline timer', async () => {
    const instance = host();
    await boot(instance);
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const pending = instance.readFile('file');
    await jest.advanceTimersByTimeAsync(30001);
    expect(await pending).toMatchObject({ ok: false, code: 'DAEMON_TIMEOUT' });
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('shutdown aborts in-flight commands', async () => {
    const instance = host();
    await boot(instance);
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const pending = instance.executeCommandSecure('echo test', 10, 'project', 'employee', 'cmd');
    instance.shutdown();
    expect(await pending).toMatchObject({ ok: false, code: 'DAEMON_DOWN' });
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(await instance.readFile('file')).toMatchObject({ code: 'DAEMON_DOWN' });
  });

  test.each([
    { jsonrpc: '2.0', id: 'wrong', result: { ok: true, output: 'bad' } },
    { jsonrpc: '2.0', result: { ok: 'yes' } },
  ])('rejects malformed or mismatched RPC response %j', async response => {
    const instance = host();
    await boot(instance);
    (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(response)));
    expect(await instance.readFile('file')).toMatchObject({ ok: false, code: 'DAEMON_PROTOCOL_ERROR' });
  });

  test('limits response bytes before JSON parsing', async () => {
    const instance = host();
    await boot(instance);
    (global.fetch as jest.Mock).mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    expect(await instance.readFile('file')).toMatchObject({ code: 'DAEMON_RESPONSE_LIMIT' });
  });

  test('deadline covers a response whose body stalls after headers', async () => {
    const instance = host();
    await boot(instance);
    const cancel = jest.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel });
    (global.fetch as jest.Mock).mockResolvedValue(new Response(body));
    const pending = instance.readFile('file');
    await jest.advanceTimersByTimeAsync(30001);
    expect(await pending).toMatchObject({ code: 'DAEMON_TIMEOUT' });
    expect(cancel).toHaveBeenCalled();
  });

  test('shutdown during filesystem discovery prevents spawning', async () => {
    const instance = host();
    const rejected = expect(instance.initialize()).rejects.toThrow('cancelled');
    await instance.shutdown();
    await rejected;
    expect(spawn).not.toHaveBeenCalled();
  });
});
