import {
  computeProductOfExperts,
  expandSparseVariance,
  isCircuitBreakerTripped,
} from '@/lib/jepa/vjepa';
import { forwardFFT, inverseFFT, packBelief, unpackBeliefAndInvert } from '@/lib/jepa/compression/spectral-fft';

describe('computeProductOfExperts', () => {
  it('when prior variance is very low, posterior mean shifts toward prior mean', () => {
    const dynMu = [1, 2, 3];
    const dynVar = [1, 1, 1];
    const priorMu = [10, 20, 30];
    const priorVar = [1e-4, 1e-4, 1e-4];

    const { poeMu, poeVar } = computeProductOfExperts(dynMu, dynVar, priorMu, priorVar);

    for (let i = 0; i < 3; i++) {
      expect(Math.abs(poeMu[i] - priorMu[i])).toBeLessThan(0.01);
      expect(poeVar[i]).toBeLessThan(1e-3);
    }
  });

  it('when dynamics variance is very low, posterior mean stays near dynamics mean', () => {
    const dynMu = [10, 20, 30];
    const dynVar = [1e-4, 1e-4, 1e-4];
    const priorMu = [1, 2, 3];
    const priorVar = [1, 1, 1];

    const { poeMu, poeVar } = computeProductOfExperts(dynMu, dynVar, priorMu, priorVar);

    for (let i = 0; i < 3; i++) {
      expect(Math.abs(poeMu[i] - dynMu[i])).toBeLessThan(0.01);
      expect(poeVar[i]).toBeLessThan(1e-3);
    }
  });

  it('returns precision-weighted average when both experts have moderate variance', () => {
    const dynMu = [0, 0];
    const dynVar = [1, 1];
    const priorMu = [2, 2];
    const priorVar = [1, 1];

    const { poeMu } = computeProductOfExperts(dynMu, dynVar, priorMu, priorVar);

    expect(poeMu[0]).toBeCloseTo(1, 5);
    expect(poeMu[1]).toBeCloseTo(1, 5);
  });

  it('posterior variance is less than either input variance', () => {
    const dynMu = [0, 0];
    const dynVar = [4, 4];
    const priorMu = [0, 0];
    const priorVar = [9, 9];

    const { poeVar } = computeProductOfExperts(dynMu, dynVar, priorMu, priorVar);

    for (let i = 0; i < 2; i++) {
      expect(poeVar[i]).toBeLessThan(4);
      expect(poeVar[i]).toBeLessThan(9);
    }
  });
});

describe('expandSparseVariance', () => {
  it('fills baseline variance for all indices by default', () => {
    const dense = expandSparseVariance([], [], 8, 0.01);
    expect(dense.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(dense[i]).toBeCloseTo(0.01, 5);
    }
  });

  it('overrides specified indices with provided values', () => {
    const dense = expandSparseVariance([1, 3], [0.5, 0.9], 8, 0.01);
    expect(dense[1]).toBeCloseTo(0.5, 5);
    expect(dense[3]).toBeCloseTo(0.9, 5);
    expect(dense[0]).toBeCloseTo(0.01, 5);
    expect(dense[2]).toBeCloseTo(0.01, 5);
  });
});

describe('isCircuitBreakerTripped', () => {
  it('trips when maxVarianceDim > 0.95', () => {
    expect(isCircuitBreakerTripped(0.96)).toBe(true);
    expect(isCircuitBreakerTripped(0.95)).toBe(false);
  });
});

describe('spectral-fft roundtrip', () => {
  it('reconstructs low-frequency signals with high cosine similarity', () => {
    const mu = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      const t = (i / 127) * Math.PI * 4;
      mu[i] = Math.sin(t) + 0.5 * Math.sin(3 * t) + 0.3 * Math.cos(5 * t);
    }

    const packed = packBelief(mu, 0.25);
    expect(packed.length).toBeGreaterThan(0);

    const rec = unpackBeliefAndInvert(packed, 128);
    expect(rec.length).toBe(128);

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 128; i++) {
      dot += mu[i] * rec[i];
      normA += mu[i] * mu[i];
      normB += rec[i] * rec[i];
    }
    const cosineSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    expect(cosineSim).toBeGreaterThan(0.99);
  });
});
