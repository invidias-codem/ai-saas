import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(action, predicate, milliseconds = 25000) {
  const deadline = Date.now() + milliseconds;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await action(); if (predicate(value)) return value; } catch (error) { lastError = error; }
    await pause(200);
  }
  throw lastError ?? new Error('Native UI condition was not reached');
}
export async function withWebdriver(application, action) {
  const driver = spawn('tauri-driver', ['--port', '4444'], { stdio: 'ignore' });
  let driverError;
  driver.on('error', error => { driverError = error; });
  let session;
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:4444${route}`, { method, signal: AbortSignal.timeout(15000),
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok || result.value?.error) throw new Error(`WebDriver ${method} ${route}: ${result.value?.error ?? response.status}`);
    return result.value;
  };
  try {
    await until(() => { if (driverError) throw driverError; return request('/status'); }, () => true);
    const created = await request('/session', 'POST', { capabilities: { alwaysMatch: { 'tauri:options': { application } } } });
    session = created.sessionId;
    assert.ok(session);
    const rpc = (route, method, body) => request(`/session/${session}${route}`, method, body);
    const script = (code, args = []) => rpc('/execute/sync', 'POST', { script: code, args });
    const element = async selector => {
      const value = await rpc('/element', 'POST', { using: 'css selector', value: selector });
      const id = value['element-6066-11e4-a52e-4f735466cecf'];
      assert.ok(id); return id;
    };
    const client = {
      capabilities: created.capabilities,
      script,
      invoke: (command, input) => rpc('/execute/async', 'POST', { args: [command, input ?? null, input !== undefined], script: `
        const [command, input, hasInput] = arguments;
        const done = arguments[arguments.length - 1];
        window.__TAURI__.core.invoke(command, hasInput ? {input} : {})
          .then(value => done({ok:true,value}), error => done({ok:false,code:typeof error?.code === 'string' ? error.code : 'IPC_DENIED'}));
      ` }),
      // W3C clicks produce trusted browser events. Never call native review decisions directly.
      click: async selector => {
        const id = await element(selector);
        await until(() => rpc(`/element/${id}/enabled`), value => value === true);
        return rpc(`/element/${id}/click`, 'POST', {});
      },
      fill: async (selector, value) => {
        const id = await element(selector);
        await rpc(`/element/${id}/clear`, 'POST', {});
        await rpc(`/element/${id}/value`, 'POST', { text: value });
      },
      text: selector => script('return document.querySelector(arguments[0])?.textContent;', [selector]),
      value: selector => script('return document.querySelector(arguments[0])?.value;', [selector]),
      disabled: selector => script('return document.querySelector(arguments[0])?.disabled;', [selector]),
      mainWindow: await rpc('/window'),
      handles: () => rpc('/window/handles'),
      switchTo: handle => rpc('/window', 'POST', { handle }),
      capture: async filename => writeFile(filename, Buffer.from(await rpc('/screenshot'), 'base64')),
    };
    await action(client);
  } finally {
    if (session) await request(`/session/${session}`, 'DELETE').catch(() => {});
    if (driver.exitCode === null && driver.signalCode === null) {
      const exited = once(driver, 'exit').catch(() => {});
      driver.kill('SIGTERM'); await Promise.race([exited, pause(1500)]);
      if (driver.exitCode === null && driver.signalCode === null) { driver.kill('SIGKILL'); await Promise.race([exited, pause(1500)]); }
    }
  }
}
