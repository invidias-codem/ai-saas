/**
 * lib/jepa/p2p/serialization.ts
 *
 * Safe serialization bridge between libp2p raw bytes and the AEA engine.
 *
 * Wire format
 * -----------
 * {
 *   weights: Record<string, { dtype: string; shape: number[]; data: number[] }>,
 *   metadata: {
 *     accuracy: number;
 *     dataset_size: number;
 *     timestamp: number;
 *     peerId: string;
 *     modelGeneration: number;
 *   }
 * }
 *
 * Security
 * --------
 * - No pickle/safe/unsafe torch.load equivalent in TS: tensors are serialized
 *   as plain JSON arrays. This structurally prevents code execution from
 *   malicious peers.
 * - Production upgrade path: replace number[][] with safetensors base64.
 */

export interface TensorPayload {
  dtype: string;
  shape: number[];
  data: number[];
}

export interface GossipMetadata {
  accuracy: number;
  dataset_size: number;
  timestamp: number;
  peerId: string;
  modelGeneration: number;
}

export interface GossipPayload {
  weights: Record<string, TensorPayload>;
  metadata: GossipMetadata;
  spectralMu?: string;
  spectralVar?: string;
}

export function encodeModelState(
  stateDict: Record<string, unknown>,
  metadata: GossipMetadata,
): GossipPayload {
  const weights: Record<string, TensorPayload> = {};
  for (const [key, value] of Object.entries(stateDict)) {
    if (value && typeof value === 'object' && 'shape' in value && 'data' in value) {
      const tensor = value as { shape: number[]; data: unknown[]; dtype?: string };
      weights[key] = {
        dtype: tensor.dtype ?? 'float32',
        shape: tensor.shape,
        data: Array.isArray(tensor.data) ? tensor.data.map(Number) : [],
      };
    }
  }
  return { weights, metadata };
}

/**
 * Broadcast helpers for spectral BJEPA belief states.
 *
 * Note: keep_ratio=0.25 gives ~140 bytes for mu and a similarly small sigma
 * payload, matching the validated Python pack_belief behavior.
 */
export function encodeSpectralMu(mu: Float32Array | number[], keepRatio = 0.25): string {
  const { packBelief } = require('@/lib/jepa/compression/spectral-fft');
  const packed = packBelief(mu, keepRatio);
  return Buffer.from(packed).toString('base64');
}

export function encodeSpectralVar(sigma: Float32Array | number[], keepRatio = 0.25): string {
  const { packBelief } = require('@/lib/jepa/compression/spectral-fft');
  const packed = packBelief(sigma, keepRatio);
  return Buffer.from(packed).toString('base64');
}

export function decodeSpectralBase64(data?: string): Uint8Array | undefined {
  if (!data) return undefined;
  return new Uint8Array(Buffer.from(data, 'base64'));
}

export function decodePayload(raw: unknown): GossipPayload {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid gossip payload');
  }
  const payload = raw as Partial<GossipPayload> & { spectralMu?: unknown; spectralVar?: unknown };
  if (!payload.weights || !payload.metadata) {
    throw new Error('Gossip payload missing weights or metadata');
  }

  if (payload.spectralMu !== undefined && typeof payload.spectralMu !== 'string') {
    throw new Error('Invalid gossip payload: spectralMu must be a base64 string');
  }
  if (payload.spectralVar !== undefined && typeof payload.spectralVar !== 'string') {
    throw new Error('Invalid gossip payload: spectralVar must be a base64 string');
  }

  return payload as GossipPayload;
}

export function payloadToBuffer(payload: GossipPayload): Uint8Array {
  const encoded = JSON.stringify(payload);
  return new TextEncoder().encode(encoded);
}

export function bufferToPayload(buffer: Uint8Array): GossipPayload {
  const decoded = new TextDecoder().decode(buffer);
  return decodePayload(JSON.parse(decoded));
}
