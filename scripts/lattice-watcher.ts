#!/usr/bin/env node
/**
 * Lattice OS — `lattice watcher`
 *
 * Lightweight alerting watcher for risk telemetry.
 *
 * Flow:
 *  1. Fetch /api/risk/ale
 *  2. Evaluate threshold rules
 *  3. Dispatch alerts to Slack webhook
 *
 * Usage:
 *  npx tsx scripts/lattice-watcher.ts [--url http://localhost:3000]
 *
 * Recommended cron schedule:
 *  * * * * * npx tsx scripts/lattice-watcher.ts >> /var/log/lattice-watcher.log 2>&1
 */

import { DEFAULT_ALERT_RULES, type AlertRuleSet } from '@/lib/telemetry/alertConfig';
import { evaluateThresholds, type Metric } from '@/lib/telemetry/thresholdEvaluator';
import { dispatchSlackAlert } from '@/lib/telemetry/alertTransport';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_SLACK_WEBHOOK_URL = process.env.LATTICE_RISK_SLACK_WEBHOOK_URL || '';

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
  return body.metrics ?? [];
}

function parseArgs(): { url: string } {
  const args = process.argv.slice(2);
  let url = DEFAULT_BASE_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      url = args[++i];
    }
  }

  return { url };
}

async function runWatcher(options?: { url?: string; webhookUrl?: string }) {
  const url = options?.url ?? parseArgs().url;
  const webhookUrl = options?.webhookUrl ?? DEFAULT_SLACK_WEBHOOK_URL;

  console.log(`[watcher] fetching metrics from ${url}/api/risk/ale ...`);

  try {
    const metrics = await fetchMetrics(url);
    const alerts = evaluateThresholds(metrics, DEFAULT_ALERT_RULES);

    if (alerts.length === 0) {
      console.log('[watcher] no thresholds breached');
      return;
    }

    console.log(`[watcher] ${alerts.length} alert(s) fired`);

    for (const alert of alerts) {
      console.log(`[watcher] ${alert.severity.toUpperCase()}: ${alert.event_type} - ${alert.reason} (${alert.actual}/${alert.threshold} ${alert.unit})`);

      if (webhookUrl) {
        await dispatchSlackAlert({
          webhookUrl,
          eventType: alert.event_type,
          severity: alert.severity,
          reason: alert.reason,
          actual: alert.actual,
          threshold: alert.threshold,
          unit: alert.unit,
        });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[watcher] error: ${msg}`);
    process.exitCode = 1;
  }
}

export { runWatcher };

// CLI entrypoint
if (process.env.NODE_ENV !== 'test') {
  void runWatcher();
}
