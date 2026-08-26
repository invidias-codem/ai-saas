/**
 * lib/jepa/p2p/bridge.ts
 *
 * Bridge between the libp2p gossip transport and the local AEA engine.
 *
 * Responsibilities
 * ----------------
 * - Receives deserialized gossip payloads from `JepaP2PNode`.
 * - Copies payload tensors into AEA-compatible JS structures.
 * - Defers heavy aggregation to a downstream worker/API route to keep the
 *   libp2p message handler non-blocking.
 *
 * Security
 * --------
 * - No pickle-equivalent deserialization in TS: payloads are plain JSON.
 * - For Python interop, route aggregation through a JSON-RPC/HTTP endpoint
 *   and keep all torch operations in-process.
 */

import type { GossipPayload, GossipMetadata } from './serialization';

export interface AggregationJob {
  weights: Array<{ key: string; data: number[]; shape: number[]; dtype: string }>;
  metadata: GossipMetadata;
  queuedAt: number;
}

export interface JepaP2PBridgeOptions {
  maxBufferSize: number;
  onJob: (job: AggregationJob) => void;
}

export class JepaP2PBridge {
  private buffer: AggregationJob[] = [];
  private readonly maxBufferSize: number;
  private readonly onJob: (job: AggregationJob) => void;

  constructor(options: JepaP2PBridgeOptions) {
    this.maxBufferSize = options.maxBufferSize;
    this.onJob = options.onJob;
  }

  enqueue(payload: GossipPayload): void {
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
    }

    const weights = Object.entries(payload.weights).map(([key, tensor]) => ({
      key,
      data: tensor.data,
      shape: tensor.shape,
      dtype: tensor.dtype,
    }));

    this.buffer.push({
      weights,
      metadata: payload.metadata,
      queuedAt: Date.now(),
    });

    const job = this.buffer.shift()!;
    this.onJob(job);
  }

  pendingCount(): number {
    return this.buffer.length;
  }

  drain(): AggregationJob[] {
    const drained = this.buffer.slice();
    this.buffer = [];
    return drained;
  }
}
