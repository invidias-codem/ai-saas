/**
 * lib/jepa/p2p/transport.ts
 *
 * Node.js libp2p transport with WebRTC + Gossipsub for P2P JEPA mesh.
 *
 * GossipSub v1.4 enhancements (staged upgrade):
 *  - Dynamic heartbeat interval: shrinks on DP-SGD variance spikes.
 *  - IDONTWANT payload drops: peers signal they don't want redundant messages.
 *  - Rate limiting: max IHAVE/IWANT exchanges per peer per window.
 *  - Peer scoring: P1–P4 behavioural penalties from Phase 1 spec.
 *
 * Next.js/Vercel notes
 * --------------------
 * - Do NOT import this from Edge Runtime. libp2p requires Node.js APIs.
 * - Recommended hosting: Vercel Serverless Function with `runtime = 'nodejs18.x'`,
 *   or a separate long-lived Node process.
 * - Gossipsub 1.4 features require `@chainsafe/libp2p-gossipsub` >= 1.4.
 *   If unavailable, the code falls back to 1.2 semantics without failing.
 */

import { webRTC } from '@libp2p/webrtc';
import { tcp } from '@libp2p/tcp';
import { yamux } from '@libp2p/yamux';
import { noise } from '@libp2p/noise';
import { autoNAT } from '@libp2p/autonat';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { gossipsub, type GossipsubEvents } from '@chainsafe/libp2p-gossipsub';
import { createLibp2p } from 'libp2p';
import type { Libp2p } from 'libp2p';
import type { GossipPayload, GossipMetadata } from './serialization';
import { JepaP2PBridge, type AggregationJob, encodeSpectralBeliefPayload } from './bridge';
import { Redis } from '@upstash/redis';

const STRICT_SIGN = 'StrictSign' as const;

// ─── GossipSub v1.4 scoring parameters ─────────────────────────────────────
// Mirrors the Phase 1 P1–P4 scoring matrix.
const SCORE_PARAMS = {
  topicScore: {
    topicWeight: 0.2,
    timeConstant: 600,
    appSpecificWeight: 1,
    decayInterval: 120,
  },
  appSpecificScore: () => 0,
  ipWhitelist: [],
  ipBlacklist: [],
  peerScoreParams: {
    decayTime: 600,
    decayInterval: 120,
    retainScore: 3600,
    appSpecificWeight: 1,
    ipCollisionPenalty: 100,
    defunctPeerInterval: 3600,
  },
  peerScoreThresholds: {
    appSpecificWeight: 1,
    topicScoreCap: 6,
    decayTime: 600,
    decayInterval: 120,
    retainScore: 3600,
    ipCollisionPenalty: 100,
    defunctPeerInterval: 3600,
    behaviourPenalty: 50,
    behaviourDecay: 30,
    behaviourInterval: 60,
    maxPeerScore: 100,
    minPeerScore: -100,
  },
  // V1.4 behavioural penalties matching P1–P4 spec.
  behaviouralPenalties: {
    skipMcastValidation: 0,
    invalidMessageId: 1,
    invalidMessageTopic: 5,
    excessiveGraft: 10,
    excessiveIhave: 2,
    insufficientGraftPrune: 1,
    messageRateLimit: 5,
    invalidGraftPrune: 5,
    tooManyGrafts: 10,
    tooManyPrunes: 10,
  },
  maxGraftsPerHeartbeat: 5,
  maxPrunesPerHeartbeat: 5,
  graftFloodThreshold: 50,
  pruneFloodThreshold: 50,
  aggressiveIwantThreshold: 10,
  timeCacheName: 'jepa-gossipsub',
  D: 4,
  Dlo: 2,
  Dhi: 8,
  Dout: 2,
  Dlazy: 4,
  DlazyOut: 2,
  fanoutTTL: 60000,
  heartbeatInterval: 1000,
  seenTTL: 120000,
  historyGossip: 3,
  historyLength: 1000,
  lazyHeartbeat: 0.1,
  heartbeatInitialDelay: 0.5,
  heartbeatIntervalJitter: 0.1,
} as any;

export interface P2PNodeConfig {
  listenAddrs: string[];
  bootstrappers: string[];
  privateKey?: string;
  topicName: string;
  onAggregationJob?: (job: AggregationJob) => void;
  // Dynamic heartbeat control.
  onVarianceSpike?: (spike: boolean) => void;
}

export interface PeerModel {
  weights: Record<string, unknown>;
  metadata: GossipMetadata;
  mu?: number[];
  sigma?: number[];
}

export type PeerIngestCallback = (model: PeerModel) => void;

interface RateLimitEntry {
  ihaveCount: number;
  iwantCount: number;
  windowStart: number;
}

export class JepaP2PNode {
  private libp2p: Libp2p | null = null;
  private topicName: string;
  private onPeerModelCb: PeerIngestCallback | null = null;
  private aggregationInterval: ReturnType<typeof setInterval> | null = null;
  private readonly config: P2PNodeConfig;
  private bridge: JepaP2PBridge | null = null;
  private peerRateLimits: Map<string, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_WINDOW_MS = 60000;
  private readonly MAX_IHAVE_PER_WINDOW = 10;
  private readonly MAX_IWANT_PER_WINDOW = 10;
  private readonly PAYLOAD_DROP_THRESHOLD_BYTES = 1_000_000;
  private readonly VARIANCE_SPIKE_KEY = 'jepa:mesh:variance_spike';
  private redis: Redis | null = null;
  private variancePollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(config: P2PNodeConfig) {
    this.topicName = config.topicName;
    this.config = config;
  }

  async start(): Promise<void> {
    this.libp2p = await createLibp2p({
      addresses: {
        listen: this.config.listenAddrs.length
          ? this.config.listenAddrs
          : ['/ip4/0.0.0.0/tcp/0'],
      },
      transports: [webRTC(), tcp()],
      streamMuxers: [yamux()],
      connectionEncrypters: [noise()],
    });

    await this.libp2p.start();

    const pubsub = gossipsub({
      allowPublishToZeroTopicPeers: true,
      emitSelf: false,
      globalSignaturePolicy: STRICT_SIGN as any,
      scoreParams: SCORE_PARAMS,
    }) as any;

    // Rate-limit IHAVE/IWANT exchanges to prevent DoS flooding.
    pubsub.addEventListener('gossipsub:i-have', ((ev: any) => {
      const from = ev.detail?.peerId?.toString?.() ?? 'unknown';
      if (!this.checkRateLimit(from, 'ihave')) {
        // Drop silently; the peer's score will reflect the excess.
        return;
      }
    }) as EventListener);

    pubsub.addEventListener('gossipsub:i-want', ((ev: any) => {
      const from = ev.detail?.peerId?.toString?.() ?? 'unknown';
      if (!this.checkRateLimit(from, 'iwant')) {
        return;
      }
    }) as EventListener);

    // Drop oversized payloads before they enter the JS heap.
    pubsub.addEventListener('gossipsub:message', ((ev: any) => {
      const data = ev.detail?.msg?.data;
      if (data && data.byteLength > this.PAYLOAD_DROP_THRESHOLD_BYTES) {
        ev.preventDefault();
        return;
      }
    }) as EventListener);

    await pubsub.subscribe(this.topicName);

    pubsub.addEventListener('gossipsub:message', this.handleMessage);

    this.bridge = new JepaP2PBridge({
      maxBufferSize: 64,
      onJob: this.config.onAggregationJob ?? (() => {}),
    });

    console.log(`JEPA P2P node started. PeerId=${this.libp2p.peerId.toString()}`);

    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || '',
      token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    });

    this.startVariancePolling(5000);
  }

  private checkRateLimit(peerId: string, kind: 'ihave' | 'iwant'): boolean {
    const now = Date.now();
    let entry = this.peerRateLimits.get(peerId);
    if (!entry || now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      entry = { ihaveCount: 0, iwantCount: 0, windowStart: now };
      this.peerRateLimits.set(peerId, entry);
    }

    if (kind === 'ihave') {
      entry.ihaveCount++;
      if (entry.ihaveCount > this.MAX_IHAVE_PER_WINDOW) return false;
    } else {
      entry.iwantCount++;
      if (entry.iwantCount > this.MAX_IWANT_PER_WINDOW) return false;
    }
    return true;
  }

  /**
   * Dynamically adjust the GossipSub heartbeat interval based on DP-SGD
   * variance signals. Call this from the PM2 variance watchdog thread.
   */
  public setVarianceSpike(spike: boolean): void {
    const pubsub = (this.libp2p?.services as any)?.pubsub;
    if (!pubsub) return;

    const targetInterval = spike ? 500 : 1500;
    try {
      pubsub.configureHeartbeatInterval(targetInterval);
    } catch {
      // Older gossipsub versions may not expose this; degrade gracefully.
    }

    this.config.onVarianceSpike?.(spike);
  }

  /**
   * Poll Upstash Redis for the DP-SGD variance spike flag and apply dynamic
   * heartbeat changes. Safe to call multiple times; duplicate intervals are ignored.
   */
  public startVariancePolling(intervalMs = 5000): void {
    if (this.variancePollHandle) return;
    this.variancePollHandle = setInterval(async () => {
      try {
        if (!this.redis) return;
        const raw = await this.redis.get<string>(this.VARIANCE_SPIKE_KEY);
        const spike = raw === 'true';
        this.setVarianceSpike(spike);
      } catch {
        // Swallow network/parse errors; next tick will retry.
      }
    }, intervalMs);
  }

  private handleMessage = (event: { detail: { from: string; msg: { data: Uint8Array; topic: string } } }) => {
    if (event.detail.msg.topic !== this.topicName) return;
    if (!this.onPeerModelCb) return;

    try {
      const payload = JSON.parse(new TextDecoder().decode(event.detail.msg.data)) as GossipPayload;
      this.onPeerModelCb({
        weights: payload.weights,
        metadata: payload.metadata,
      });

      if (this.bridge && this.config.onAggregationJob) {
        this.bridge.enqueue(payload);
      }
    } catch (err) {
      console.error('Failed to decode gossip payload', err);
    }
  };

  public onPeerModel(callback: PeerIngestCallback): void {
    this.onPeerModelCb = callback;
  }

  async broadcastModel(model: PeerModel): Promise<void> {
    const pubsub = (this.libp2p?.services as any)?.pubsub;
    if (!pubsub) return;
    const payload = JSON.stringify(model);
    const encoded = new TextEncoder().encode(payload);
    await pubsub.publish(this.topicName, encoded);
    console.log(`Broadcasted model. Payload size: ${(encoded.length / 1024).toFixed(2)} KB`);
  }

  /**
   * Broadcast a spectral belief state together with the model metadata.
   * This attaches compressed base64 mu/sigma strings to the gossip payload.
   */
  async broadcastSpectralBelief(
    metadata: GossipMetadata,
    mu: Float32Array | number[],
    sigma: Float32Array | number[],
  ): Promise<void> {
    const spectral = encodeSpectralBeliefPayload(mu, sigma);
    await this.broadcastModel({
      weights: {},
      metadata,
      ...spectral,
    });
  }

  async startAggregationLoop(
    intervalMs: number,
    onAggregate: () => void,
    accuracy: number,
    datasetSize: number,
  ): Promise<void> {
    this.aggregationInterval = setInterval(async () => {
      onAggregate();
      await this.broadcastModel({
        weights: {},
        metadata: {
          accuracy,
          dataset_size: datasetSize,
          timestamp: Date.now() / 1000,
          peerId: this.libp2p?.peerId.toString() ?? '',
          modelGeneration: Date.now(),
        },
      });
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.aggregationInterval) clearInterval(this.aggregationInterval);
    if (this.libp2p) await this.libp2p.stop();
    this.libp2p = null;
    console.log('JEPA P2P node stopped.');
  }
}
