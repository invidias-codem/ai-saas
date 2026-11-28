import { loadPriorExpert } from '@/lib/jepa/priors';

describe('loadPriorExpert', () => {
  it('returns finite 128-d vectors for memory_safety', () => {
    const prior = loadPriorExpert('memory_safety');

    expect(prior.id).toBe('memory_safety');
    expect(prior.priorMu).toHaveLength(128);
    expect(prior.priorVar).toHaveLength(128);

    for (const v of prior.priorMu) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const v of prior.priorVar) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('throws for unknown constraint IDs', () => {
    expect(() => loadPriorExpert('nonexistent')).toThrow();
  });
});
