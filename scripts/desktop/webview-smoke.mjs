// Real native WebView via tauri-driver; no daemon port/token access or approval bypass.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const application = path.join(root, 'src-tauri/target/release', process.platform === 'win32' ? 'app.exe' : 'app');
const endpoint = 'http://127.0.0.1:4444';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const rpc = async (route, method = 'GET', body) => {
  const response = await fetch(`${endpoint}${route}`, { method, signal: AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(`WebDriver request failed: ${response.status} ${result.value?.error ?? ''}`);
  return result.value;
};
const eventually = async (action, predicate) => {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const result = await action(); if (predicate(result)) return result; } catch (error) { lastError = error; }
    await wait(500);
  }
  throw lastError ?? new Error('Measured WebView condition was not reached');
};

test('real bundled WebView authenticates, enforces scope, and restarts the daemon', { timeout: 120000 }, async () => {
  await access(application);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const driver = spawn('tauri-driver', ['--port', '4444'], { stdio: 'ignore' });
  let driverError;
  driver.on('error', error => { driverError = error; });
  let sessionId;
  const measured = [];
  let passed = false;
  try {
    await eventually(async () => { if (driverError) throw driverError; return rpc('/status'); }, () => true);
    const session = await rpc('/session', 'POST', { capabilities: { alwaysMatch: { 'tauri:options': { application } } } });
    sessionId = session.sessionId;
    assert.ok(sessionId);
    const execute = script => rpc(`/session/${sessionId}/execute/async`, 'POST', { script, args: [] });
    const invoke = (command, input) => execute(`
      const done = arguments[arguments.length - 1];
      window.__TAURI__.core.invoke(${JSON.stringify(command)}, ${input === undefined ? '{}' : JSON.stringify({ input })})
        .then(value => done({ok: true, value}), error => done({ok: false, code: typeof error?.code === 'string' ? error.code : 'IPC_DENIED'}));
    `);
    const status = await eventually(() => invoke('ping_daemon'), value => value.ok && value.value?.status === 'ok');
    assert.equal(status.value.status, 'ok'); measured.push('authenticated-status-through-webview');
    assert.deepEqual(await invoke('native_workspace_grants', {}), { ok: true, value: [] }); measured.push('fresh-session-has-no-grants');
    const denied = await invoke('native_read_text', { grant_id: `local-grant-${'a'.repeat(32)}`, relative_path: 'note.md' });
    assert.equal(denied.ok, false); assert.equal(denied.code, 'LOCAL_GRANT_DENIED'); measured.push('ungranted-read-denied');
    assert.equal((await invoke('native_review_document', {})).ok, false); measured.push('main-webview-cannot-read-review-document');
    const restart = await invoke('restart_daemon');
    assert.equal(restart.ok, true); assert.equal(restart.value.status, 'ok');
    await eventually(() => invoke('ping_daemon'), value => value.ok && value.value?.status === 'ok');
    assert.deepEqual(await invoke('native_workspace_grants', {}), { ok: true, value: [] }); measured.push('authenticated-restart-through-webview');
    passed = true;
  } finally {
    await writeFile(path.join(root, 'webview-smoke-results.json'), `${JSON.stringify({ schemaVersion: 1,
      sourceCommit, platform: process.platform, architecture: process.arch, passed, measured,
      nativeDialogsTested: false, reviewedMutationTested: false, cleanMachineInstallTested: false,
      note: 'Native picker, consent, review acceptance, exact disk contents and installed-package behavior still require platform qualification.',
    }, null, 2)}\n`);
    if (sessionId) await rpc(`/session/${sessionId}`, 'DELETE').catch(() => {});
    if (driver.exitCode === null && driver.signalCode === null) {
      const exited = once(driver, 'exit').catch(() => {});
      driver.kill('SIGTERM'); await Promise.race([exited, wait(1500)]);
      if (driver.exitCode === null && driver.signalCode === null) { driver.kill('SIGKILL'); await Promise.race([exited, wait(1500)]); }
    }
  }
});
