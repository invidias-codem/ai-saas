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

import type { GossipPayload, GossipMetadata, TensorPayload } from './serialization';
import { packBelief } from '../compression/spectral-fft';
import { decodeSpectralBase64 } from './serialization';

export interface AggregationJob {
  weights: Array<{ key: string; data: number[]; shape: number[]; dtype: string }>;
  metadata: GossipMetadata;
  queuedAt: number;
  spectralMu?: Uint8Array;
  spectralVar?: Uint8Array;
}

/**
 * Outgoing broadcast helper: pack raw belief tensors into base64 strings
 * suitable for attaching to a GossipPayload.
 */
export function encodeSpectralBeliefPayload(
  mu: Float32Array | number[],
  sigma: Float32Array | number[],
): Pick<GossipPayload, 'spectralMu' | 'spectralVar'> {
  return {
    spectralMu: Buffer.from(packBelief(mu, 0.25)).toString('base64'),
    spectralVar: Buffer.from(packBelief(sigma, 0.25)).toString('base64'),
  };
}

/**
 * Convert an AggregationJob to a JSON-serializable dict.
 * Spectral byte arrays are emitted as base64 strings for JSONL transport.
 */
export function aggregationJobToJson(job: AggregationJob): string {
  const serializable: Record<string, unknown> = {
    weights: job.weights,
    metadata: job.metadata,
    queuedAt: job.queuedAt,
  };
  if (job.spectralMu) {
    serializable.spectralMu = Buffer.from(job.spectralMu).toString('base64');
  }
  if (job.spectralVar) {
    serializable.spectralVar = Buffer.from(job.spectralVar).toString('base64');
  }
  return JSON.stringify(serializable);
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

    const job: AggregationJob = {
      weights,
      metadata: payload.metadata,
      queuedAt: Date.now(),
    };

    if (payload.spectralMu !== undefined) {
      job.spectralMu = new Uint8Array(Buffer.from(payload.spectralMu, 'base64'));
    }
    if (payload.spectralVar !== undefined) {
      job.spectralVar = new Uint8Array(Buffer.from(payload.spectralVar, 'base64'));
    }

    this.buffer.push(job);

    const shifted = this.buffer.shift()!;
    this.onJob(shifted);
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
