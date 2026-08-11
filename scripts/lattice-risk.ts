#!/usr/bin/env node
/**
 * Lattice OS — `lattice risk`
 *
 * Terminal-native ALE risk metrics viewer.
 * Zero-dependency: uses Node 18+ built-in fetch and ANSI escape sequences.
 *
 * Usage:
 *   npx tsx scripts/lattice-risk.ts [--watch] [--json] [--url http://localhost:3000]
 */

import { renderTable } from '@/lib/telemetry/riskFormatter';

type Metric = {
  event_type: string;
  total_occurrences_30d: number;
  projected_aro: number;
  current_ale_usd: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

type ApiResponse = {
  success: boolean;
  metrics: Metric[];
};

async function fetchMetrics(baseUrl: string): Promise<Metric[]> {
  const url = new URL('/api/risk/ale', baseUrl).toString();
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const body = (await res.json()) as ApiResponse;
  if (!body.success) throw new Error(body.metrics ? 'query failed' : 'unknown error');
  const sorted = [...(body.metrics ?? [])].sort((a, b) => b.current_ale_usd - a.current_ale_usd);
  return sorted;
}

function parseArgs(): { url: string; watch: boolean; json: boolean } {
  const args = process.argv.slice(2);
  let url = 'http://localhost:3000';
  let watch = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') watch = true;
    else if (args[i] === '--json') json = true;
    else if (args[i] === '--url' && args[i + 1]) {
      url = args[++i];
    }
  }

  return { url, watch, json };
}

async function render() {
  const { url, json } = parseArgs();
  const metrics = await fetchMetrics(url);

  if (json) {
    console.log(JSON.stringify({ success: true, metrics }, null, 2));
    return;
  }

  console.log(renderTable(metrics));
}

async function watchLoop() {
  const { url, json } = parseArgs();

  if (json) {
    console.error('--json is not compatible with --watch');
    process.exit(1);
  }

  const clear = (lines: number) => process.stdout.write(`\x1b[${lines}A\x1b[J`);
  let renderedLines = 0;

  const loop = async () => {
    try {
      const metrics = await fetchMetrics(url);
      const table = renderTable(metrics);
      const lines = table.split('\n').length;
      if (renderedLines > 0) clear(renderedLines);
      console.log(table);
      renderedLines = lines + 1; // +1 for blank line
    } catch (err) {
      if (renderedLines > 0) clear(renderedLines);
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\x1b[31mError: ${msg}\x1b[0m`);
      renderedLines = 2;
    }
  };

  await loop();
  const interval = setInterval(loop, 5000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    if (renderedLines > 0) clear(renderedLines);
    console.log('\nlattice risk monitor stopped.');
    process.exit(0);
  });
}

(async () => {
  const { watch } = parseArgs();
  if (watch) await watchLoop();
  else await render();
})().catch((err) => {
  console.error(`\x1b[31mFatal: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
  process.exit(1);
});
