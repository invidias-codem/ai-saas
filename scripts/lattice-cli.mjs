#!/usr/bin/env node
'use strict';
import https from 'node:https';
import http from 'node:http';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

function printHelpAndExit() {
  console.log(`usage:
  node scripts/lattice-cli.mjs prompt "your prompt"
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
  const headers = {};
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

    if (line.startsWith(':')) continue;

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

    if (line.startsWith('retry:')) continue;
  }

  if (current) events.push(current);
  return events;
}

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  redBg: '\u001b[41m',
  whiteFg: '\u001b[37m',
  yellowBg: '\u001b[43m',
  blackFg: '\u001b[30m',
};

function renderAlertBanner(alert) {
  const severity = (alert?.severity || 'warn').toLowerCase();
  const isCritical = severity === 'critical';
  const bg = isCritical ? ANSI.redBg : ANSI.yellowBg;
  const fg = isCritical ? ANSI.whiteFg : ANSI.blackFg;
  const title = isCritical ? 'CRITICAL' : 'WARN';
  const lines = [
    '',
    `${bg}${fg}${ANSI.bold}   ⚠  LATTICE RISK ALERT   ${ANSI.reset}`,
    `${bg}${fg} severity=${title} event=${alert?.event_type || 'unknown'} reason=${alert?.reason || 'unknown'} ${ANSI.reset}`,
    `${bg}${fg} actual=${alert?.actual ?? '?'} threshold=${alert?.threshold ?? '?'} unit=${alert?.unit || ''} ${ANSI.reset}`,
    `${bg}${fg}${ANSI.bold}   Press ENTER to acknowledge and resume...   ${ANSI.reset}`,
    '',
  ];
  process.stderr.write(lines.join('\n'));
}

async function waitForAcknowledgment() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  try {
    await new Promise((resolve) => {
      rl.question('', () => resolve(undefined));
    });
  } finally {
    rl.close();
  }
}

function handleEvent(event, raw) {
  if (!raw) return;
  switch (event) {
    case 'meta': {
      const meta = JSON.parse(raw);
      console.log(`\n[task ${meta.taskId?.slice(0, 8)}] trace=${meta.traceId?.slice(0, 8)} model=${meta.model}\n`);
      break;
    }
    case 'thought': {
      const thought = JSON.parse(raw);
      console.log(`  [thought ${thought.step}] ${thought.text}\n`);
      break;
    }
    case 'tool': {
      const tool = JSON.parse(raw);
      const status = tool.status === 'success' ? '✓' : '✗';
      console.log(`  [tool ${status} ${tool.name}] ${tool.latencyMs}ms output=${tool.outputSize}`);
      if (tool.error) console.log(`         error: ${tool.error}`);
      break;
    }
    case 'error': {
      const err = JSON.parse(raw);
      console.error(`\n[error] ${err.message} phase=${err.phase}\n`);
      break;
    }
    case 'done': {
      const done = JSON.parse(raw);
      console.log(`\n[done] status=${done.status} durationMs=${done.durationMs} trace=${done.traceId?.slice(0, 8)}`);
      if (done.result) console.log(`\n${done.result}\n`);
      break;
    }
    default:
      console.log(`[${event ?? 'event'}] ${raw}`);
  }
}

async function runPrompt(promptText) {
  const env = parseCliEnv();
  const url = new URL(`${env.apiBase}/api/cli/stream`);
  url.searchParams.set('prompt', promptText);
  url.searchParams.set('task_type', 'blog_post');
  url.searchParams.set('user_id', env.userId);

  const maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    let buffer = '';
    let traceIdForRetry = null;
    let lastEventId = null;
    let paused = false;
    let pendingEvents = [];
    let streamFinished = false;

    const curlArgs = [
      '--silent',
      '--show-error',
      '-N',
      '-X',
      'GET',
      '-H',
      'Accept: text/event-stream',
      '-H',
      `Authorization: Bearer ${env.authHeader}`,
      ...(env.bypassSecret
        ? [
            '-H',
            `x-vercel-protection-bypass: ${env.bypassSecret}`,
            '-H',
            'x-vercel-set-bypass-cookie: true',
          ]
        : []),
      url.toString(),
    ];

    const curl = spawn('curl', curlArgs, { stdio: ['pipe', 'pipe', 'inherit'] });

    curl.stdout.on('data', (data) => {
      buffer += data.toString('utf8');
      const events = parseSseLines(buffer);
      const keep = events.length > 0 ? buffer.slice(buffer.lastIndexOf('\n\n') + 2) : buffer;
      buffer = keep;

      for (const event of events) {
        const raw = (event.data ?? '').trim();
        if (!raw) continue;

        if (event.event === 'meta') {
          try {
            const meta = JSON.parse(raw);
            traceIdForRetry = meta.traceId;
            lastEventId = meta.taskId;
            url.searchParams.set('trace_id', traceIdForRetry);
            url.searchParams.set('last_event_id', String(lastEventId));
          } catch {}
        }

        if (event.event === 'done') {
          streamFinished = true;
        }

        if (paused) {
          pendingEvents.push({ event: event.event, raw });
          continue;
        }

        if (event.event === 'alert') {
          paused = true;
          try {
            renderAlertBanner(JSON.parse(raw));
            waitForAcknowledgment().then(() => {
              for (const buffered of pendingEvents) handleEvent(buffered.event, buffered.raw);
              pendingEvents = [];
              paused = false;
            });
          } finally {
            // do not process same alert again until acknowledged
          }
          continue;
        }

        handleEvent(event.event, raw);
      }
    });

    curl.on('close', (code) => {
      if (streamFinished || code === 0) {
        process.exitCode = code;
        return;
      }
      if (attempt >= maxAttempts) {
        console.error(`\n[stream] exited after ${attempt} attempts`);
        process.exitCode = code;
        return;
      }
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.warn(`\n[stream] connection lost, retrying in ${backoffMs}ms... (attempt ${attempt}/${maxAttempts})`);
      setTimeout(() => {}, backoffMs);
    });

    curl.on('error', (err) => {
      console.error('curl failed:', err.message);
      if (attempt >= maxAttempts) process.exit(1);
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.warn(`\n[stream] network error, retrying in ${backoffMs}ms... (attempt ${attempt}/${maxAttempts})`);
      setTimeout(() => {}, backoffMs);
    });

    await new Promise((resolve) => {
      const checkDone = setInterval(() => {
        if (streamFinished || curl.exitCode != null || !curl.pid) {
          clearInterval(checkDone);
          resolve(undefined);
        }
      }, 200);
    });

    if (streamFinished) break;
  }
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
