/**
 * workers/jepa-p2p-worker.ts
 *
 * Standalone long-lived Node.js worker for the decentralized JEPA mesh.
 *
 * Requirements
 * ------------
 * - Node.js with native fetch (Node 18+)
 * - tsx for TS execution
 * - lib/jepa/p2p/transport.ts from the main workspace
 *
 * Env vars
 * --------
 * - JEPA_P2P_LISTEN_ADDRS: comma-separated multiaddrs
 * - JEPA_P2P_BOOTSTRAPPERS: comma-separated bootstrap multiaddrs
 * - JEPA_P2P_TOPIC: pubsub topic name
 * - JEPA_QUEUE_PATH: path to gossip_queue.jsonl
 * - JEPA_AGG_INTERVAL_SECONDS: aggregation interval, default 60
 * - JEPA_PUBLIC_DIAL_TIMEOUT: timeout in ms, default 10000
 *
 * Run
 * ---
 * tsx workers/jepa-p2p-worker.ts
 *
 * PM2
 * ---
 * pm2 start workers/jepa-p2p-worker.ts --name jepa-p2p --interpreter tsx
 */

import { JepaP2PNode } from '../lib/jepa/p2p/transport';
import { JepaP2PBridge, type AggregationJob } from '../lib/jepa/p2p/bridge';
import { appendFileSync } from 'node:fs';

function toArray(input?: string): string[] {
  if (!input) return [];
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const listenAddrs = toArray(process.env.JEPA_P2P_LISTEN_ADDRS);
  const bootstrappers = toArray(process.env.JEPA_P2P_BOOTSTRAPPERS);
  const topic = process.env.JEPA_P2P_TOPIC ?? 'lattice/jepa/v1';
  const queuePath = process.env.JEPA_QUEUE_PATH ?? 'research/world-model/jepa-local/p2p/gossip_queue.jsonl';
  const aggIntervalMs = Number(process.env.JEPA_AGG_INTERVAL_SECONDS ?? '60') * 1000;

  const node = new JepaP2PNode({
    listenAddrs,
    bootstrappers,
    topicName: topic,
    onAggregationJob: (job: AggregationJob) => {
      try {
        const payload = JSON.stringify(job, undefined, 0);
        appendFileSync(queuePath, payload + '\n', { encoding: 'utf8' });
      } catch (err) {
        console.error('[Worker] queue write failed', err);
      }
    },
  });

  process.on('SIGINT', async () => {
    console.log('[Worker] SIGINT; stopping');
    await node.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[Worker] SIGTERM; stopping');
    await node.stop();
    process.exit(0);
  });

  await node.start();

  // Keep-alive loop: nothing to do here except react to async events.
  setInterval(async () => {
    // Optional periodic maintenance/logging could go here.
  }, aggIntervalMs);

  console.log('[Worker] jepa-p2p worker started');
}

main().catch((err) => {
  console.error('[Worker] fatal', err);
  process.exit(1);
});
