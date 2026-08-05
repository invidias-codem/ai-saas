#!/usr/bin/env node
'use strict';
import https from 'node:https';
import http from 'node:http';
import { spawn } from 'node:child_process';

function printHelpAndExit() {
  console.log(`usage:
  node scripts/lattice-cli.mjs prompt "your prompt"
  node scripts/lattice-cli.mjs prompt -- "your prompt with --flags"
  node scripts/lattice-cli.mjs doctor
`);
  process.exit(0);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function parseCliEnv() {
  const LATTICE_API_URL = requireEnv('LATTICE_API_URL');
  const authHeader = process.env.LATTICE_CLI_TOKEN || process.env.LATTICE_TOKEN || '';
  const userId = process.env.LATTICE_USER_ID || 'local';
  const bypassSecret = process.env.LATTICE_BYPASS_SECRET || '';
  const trimmed = LATTICE_API_URL.replace(/\/$/, '');
  const url = new URL(trimmed);
  const isHttps = url.protocol === 'https:';
  const headers: Record<string, string> = {};
  if (bypassSecret) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
    headers['x-vercel-set-bypass-cookie'] = 'true';
  }
  return {
    host: url.hostname,
    port: url.port || (isHttps ? '443' : '80'),
    protocol: isHttps ? 'https' : 'http',
    apiBase: `${isHttps ? 'https' : 'http'}://${url.host}${url.pathname ? url.pathname : ''}`,
    authHeader,
    userId,
    bypassSecret,
    headers,
  };
}

function makeHttpRequest({ host, port, protocol, pathname, method, headers = {}, payload }) {
  const mod = protocol === 'https' ? https : http;
  const options = {
    host,
    port: Number(port),
    path: pathname,
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runDoctor() {
  const env = parseCliEnv();

  const health = await makeHttpRequest({
    ...env,
    pathname: '/api/health',
    method: 'GET',
    headers: env.headers,
    payload: null,
  });
  console.log(`health: ${health.status}`);
  console.log(health.raw.slice(0, 200));
  console.log(`userId=${env.userId}`);
  console.log(`bearer=${env.authHeader.slice(0, 6)}...${env.authHeader.slice(-4)}`);
  if (env.bypassSecret) {
    console.log('vercel-bypass=enabled');
  }
}

function parseSseLines(text) {
  const events = [];
  const lines = text.split(/\r?\n/);
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line) {
      if (current) {
        events.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      current = current ?? {};
      current.event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      const value = line.length > 5 ? line.slice(5).trim() : '';
      const merged = current ?? {};
      merged.data = merged.data ? merged.data + '\n' + value : value;
      current = merged;
      continue;
    }

    if (line.startsWith('retry:')) {
      continue;
    }
  }

  if (current) {
    events.push(current);
  }

  return events;
}

async function runPrompt(promptText) {
  const env = parseCliEnv();
  const body = JSON.stringify({
    messages: [{ role: 'user', text: promptText }],
    options: {},
  });

  const urlStr = `${env.apiBase}/api/cli/stream`;
  const curlArgs = [
    '--silent',
    '--show-error',
    '-N',
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '-H',
    `Authorization: Bearer ${env.authHeader}`,
    '-H',
    `x-lattice-user-id: ${env.userId}`,
    ...(env.bypassSecret
      ? [
          '-H',
          `x-vercel-protection-bypass: ${env.bypassSecret}`,
          '-H',
          'x-vercel-set-bypass-cookie: true',
        ]
      : []),
    '-d',
    body,
    urlStr,
  ];

  const curl = spawn('curl', curlArgs, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buffer = '';

  curl.stdout.on('data', (data) => {
    buffer += data.toString('utf8');
    const events = parseSseLines(buffer);
    const keep = events.length > 0 ? buffer.slice(buffer.lastIndexOf('\n\n') + 2) : buffer;
    buffer = keep;

    for (const event of events) {
      const raw = (event.data ?? '').trim();
      if (!raw) continue;
      if (event.event === 'done' || event.event === 'error') {
        process.stdout.write(
          `\n[event:${event.event ?? 'unknown'}] ${raw}\n`
        );
        continue;
      }
      process.stdout.write(raw);
    }
  });

  curl.on('exit', (code) => process.exitCode = code);
  curl.on('error', (err) => {
    console.error('curl failed:', err.message);
    process.exit(1);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    printHelpAndExit();
  }
  const sub = args[0];
  const rest = args.slice(1);

  if (sub === 'doctor') {
    await runDoctor();
    return;
  }

  if (sub === 'prompt') {
    const promptText = rest.join(' ').trim();
    if (!promptText) {
      console.error('missing prompt text after: prompt <text>');
      process.exit(2);
    }
    await runPrompt(promptText);
    return;
  }

  console.error(`unknown command: ${sub}`);
  printHelpAndExit();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
