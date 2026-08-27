import { GossipPayload, decodePayload, encodeSpectralMu, encodeSpectralVar, decodeSpectralBase64 } from '@/lib/jepa/p2p/serialization';
import { JepaP2PBridge } from '@/lib/jepa/p2p/bridge';

describe('GossipPayload spectral schema', () => {
  it('accepts legacy payloads without spectral fields', () => {
    const payload = {
      weights: {},
      metadata: {
        accuracy: 0.9,
        dataset_size: 10,
        timestamp: 1,
        peerId: 'peer1',
        modelGeneration: 1,
      },
    };
    expect(() => decodePayload(payload)).not.toThrow();
  });

  it('accepts valid base64 spectral fields', () => {
    const payload = {
      weights: {},
      metadata: {
        accuracy: 0.9,
        dataset_size: 10,
        timestamp: 1,
        peerId: 'peer1',
        modelGeneration: 1,
      },
      spectralMu: Buffer.from([1, 2, 3]).toString('base64'),
      spectralVar: Buffer.from([4, 5]).toString('base64'),
    };
    const decoded = decodePayload(payload) as GossipPayload;
    expect(decoded.spectralMu).toBe(payload.spectralMu);
    expect(decoded.spectralVar).toBe(payload.spectralVar);
  });

  it('rejects non-string spectral fields', () => {
    const payload = {
      weights: {},
      metadata: {
        accuracy: 0.9,
        dataset_size: 10,
        timestamp: 1,
        peerId: 'peer1',
        modelGeneration: 1,
      },
      spectralMu: 123,
    };
    expect(() => decodePayload(payload)).toThrow('spectralMu must be a base64 string');
  });
});

describe('JepaP2PBridge spectral ingestion', () => {
  it('decodes base64 spectral bytes into Uint8Array jobs', () => {
    const jobs: any[] = [];
    const bridge = new JepaP2PBridge({
      maxBufferSize: 10,
      onJob: (job) => jobs.push(job),
    });

    bridge.enqueue({
      weights: {},
      metadata: {
        accuracy: 0.9,
        dataset_size: 10,
        timestamp: 1,
        peerId: 'peer1',
        modelGeneration: 1,
      },
      spectralMu: Buffer.from([10, 20, 30]).toString('base64'),
      spectralVar: Buffer.from([1, 2]).toString('base64'),
    });

    expect(jobs.length).toBe(1);
    expect(jobs[0].spectralMu).toEqual(new Uint8Array([10, 20, 30]));
    expect(jobs[0].spectralVar).toEqual(new Uint8Array([1, 2]));
  });

  it('leaves spectral fields undefined when absent', () => {
    const jobs: any[] = [];
    const bridge = new JepaP2PBridge({
      maxBufferSize: 10,
      onJob: (job) => jobs.push(job),
    });

    bridge.enqueue({
      weights: {},
      metadata: {
        accuracy: 0.9,
        dataset_size: 10,
        timestamp: 1,
        peerId: 'peer1',
        modelGeneration: 1,
      },
    });

    expect(jobs[0].spectralMu).toBeUndefined();
    expect(jobs[0].spectralVar).toBeUndefined();
  });
});

describe('spectral encode/decode helpers', () => {
  it('roundtrips a small tensor through encodeSpectralMu/decodeSpectralBase64', () => {
    const mu = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const encoded = encodeSpectralMu(mu, 1);
    expect(typeof encoded).toBe('string');
    const decoded = decodeSpectralBase64(encoded);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(decoded!.length).toBeGreaterThan(0);
  });
});
