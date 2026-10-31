import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { requestWebdriver } from './webdriver-protocol.mjs';

test('W3C session failures preserve the actual runtime diagnostic instead of only the error category', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: { error: 'session not created', message: 'Driver supports 155; current WebView2 runtime is 156.\nCheck the runtime driver.' } }));
  }).listen(4444, '127.0.0.1');
  await once(server, 'listening');
  try { await assert.rejects(requestWebdriver('/session', 'POST', {}), /session not created: Driver supports 155; current WebView2 runtime is 156\. Check the runtime driver\./); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('successful W3C replies return their value without the protocol envelope', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value: { ready: true } }));
  }).listen(4444, '127.0.0.1');
  await once(server, 'listening');
  try { assert.deepEqual(await requestWebdriver('/status'), { ready: true }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
