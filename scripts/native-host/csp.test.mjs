import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium } from 'playwright';

const config = JSON.parse(await readFile(new URL('../../src-tauri/tauri.conf.json', import.meta.url)));
const listen = async (handler) => {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
};

const exercise = async (policy) => {
  const hits = [];
  const probe = await listen((request, response) => {
    hits.push(request.url);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Type', 'application/javascript');
    response.end('globalThis.externalExecuted = true;');
  });
  const bootstrap = `
    globalThis.violations = [];
    addEventListener('securitypolicyviolation', e => violations.push(e.effectiveDirective));
    fetch(${JSON.stringify(`${probe.origin}/fetch`)}).catch(() => {}).finally(() => globalThis.finished = true);
  `;
  const app = await listen((request, response) => {
    if (request.url === '/bootstrap.js') {
      response.setHeader('Content-Type', 'application/javascript');
      response.end(bootstrap);
      return;
    }
    if (policy) response.setHeader('Content-Security-Policy', Object.entries(policy).map(([key, value]) => `${key} ${value}`).join('; '));
    response.setHeader('Content-Type', 'text/html');
    response.end(`<script src="/bootstrap.js"></script><script>globalThis.inlineExecuted = true;</script><script src="${probe.origin}/script"></script><iframe src="${probe.origin}/frame"></iframe>`);
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(app.origin);
    await page.waitForFunction(() => globalThis.finished === true);
    if (policy) await page.waitForFunction(() => ['connect-src', 'frame-src', 'script-src-elem'].every(rule => globalThis.violations.includes(rule)));
    const state = await page.evaluate(() => ({ inline: globalThis.inlineExecuted === true, external: globalThis.externalExecuted === true, violations: globalThis.violations }));
    return { ...state, hits };
  } finally {
    await browser?.close();
    app.server.closeAllConnections();
    probe.server.closeAllConnections();
    await Promise.all([new Promise(resolve => app.server.close(resolve)), new Promise(resolve => probe.server.close(resolve))]);
  }
};

test('the probe can execute scripts, frame content and outbound calls without CSP', async () => {
  const result = await exercise();
  assert.equal(result.inline, true);
  assert.equal(result.external, true);
  for (const path of ['/fetch', '/script', '/frame']) assert.ok(result.hits.includes(path));
});

const reviewPolicy=JSON.parse(await readFile(new URL('../../src-tauri/review-assets/policy.json',import.meta.url)));
for (const field of ['csp', 'devCsp', 'review']) {
  test(`${field} blocks injected scripts, foreign frames and outbound calls`, async () => {
    const policy = field==='review'?reviewPolicy:config.app.security[field];
    assert.ok(policy, 'A missing policy cannot qualify local IPC');
    const result = await exercise(policy);
    assert.equal(result.inline, false);
    assert.equal(result.external, false);
    assert.deepEqual(result.hits, []);
  });
}
