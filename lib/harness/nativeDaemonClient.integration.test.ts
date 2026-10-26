import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { NativeDaemonClient } from './nativeDaemonClient';

// CI builds this exact revision's daemon and explicitly supplies its location.
const binary = process.env.LATTICE_TEST_DAEMON_PATH;
const nativeTest = binary ? test : test.skip;

nativeTest('real daemon enforces grants, retains failures, and recalls project memory after restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lattice-runtime-'));
  const daemon = new NativeDaemonClient(dir);
  try {
    await daemon.initialize([binary!]);
    const request = { command: `"${process.execPath}" -e 'process.stdout.write("verified");process.exit(7)'`, timeout_seconds: 5, path: dir, user_id: 'employee', workspace_id: 'project' };
    expect(await daemon.request('execute_command_secure', request)).toMatchObject({ ok: false, code: 'COMMAND_ACCESS_DENIED' });
    expect(await daemon.request('sync_root_grants', { grants: [{ path: dir, user_id: 'employee', workspace_id: 'project', read_only: false, allow_destructive: true }], user_id: 'employee', workspace_id: 'project' })).toMatchObject({ ok: true });
    expect(await daemon.request('execute_command_secure', request)).toMatchObject({ ok: false, output: 'verified', meta: { code: 7 } });
    expect(await daemon.request('execute_command_secure', { ...request, user_id: 'other-employee' })).toMatchObject({ ok: false, code: 'COMMAND_ACCESS_DENIED' });
    expect(await daemon.request('insert_episodic_event', { workspace_id: 'project', event_type: 'checkpoint', content: 'project checkpoint', metadata: '{}', embedding: [1, 0] })).toMatchObject({ ok: true });
    await daemon.shutdown();
    await daemon.initialize([binary!]);
    // Grants are intentionally re-authorized after restart; memory is durable.
    expect(await daemon.request('execute_command_secure', request)).toMatchObject({ code: 'COMMAND_ACCESS_DENIED' });
    const recalled = await daemon.request('search_episodic_events', { workspace_id: 'project', query_embedding: [1, 0], top_k: 5 });
    expect(recalled.ok).toBe(true);
    expect(recalled.output).toContain('project checkpoint');
  } finally {
    await daemon.shutdown();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 30000);

nativeTest('unavailable memory database prevents a false ready state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lattice-bad-memory-'));
  const daemon = new NativeDaemonClient(dir);
  try {
    await fs.mkdir(path.join(dir, 'lattice_vectors.db'));
    await expect(daemon.initialize([binary!])).rejects.toThrow('closed');
    expect(await daemon.request('status', {})).toMatchObject({ ok: false, code: 'DAEMON_DOWN' });
  } finally {
    await daemon.shutdown();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 15000);

nativeTest('application shutdown stops an active command before it can write again', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lattice-shutdown-'));
  const daemon = new NativeDaemonClient(dir);
  try {
    await daemon.initialize([binary!]);
    await daemon.request('sync_root_grants', { grants: [{ path: dir, user_id: 'employee', workspace_id: 'project', allow_destructive: true }] });
    const started = path.join(dir, 'started');
    const escaped = path.join(dir, 'escaped');
    const script = `require("fs").writeFileSync(${JSON.stringify(started)},"ready");setTimeout(()=>require("fs").writeFileSync(${JSON.stringify(escaped)},"bad"),1200)`;
    const pending = daemon.request('execute_command_secure', { command: `"${process.execPath}" -e '${script}'`, timeout_seconds: 5, path: dir, user_id: 'employee', workspace_id: 'project' });
    const deadline = Date.now() + 5000;
    for (;;) {
      try { await fs.access(started); break; } catch { /* wait for the real child */ }
      if (Date.now() > deadline) throw new Error('Native command did not start');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await daemon.shutdown();
    expect(await pending).toMatchObject({ ok: false, code: 'DAEMON_DOWN' });
    await new Promise(resolve => setTimeout(resolve, 1400));
    await expect(fs.access(escaped)).rejects.toThrow();
  } finally {
    await daemon.shutdown();
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 20000);
