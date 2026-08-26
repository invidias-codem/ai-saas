/**
 * lib/jepa/vjepa.ts
 *
 * Variational JEPA (VJEPA) interface for uncertainty-aware planning.
 *
 * Provides:
 *  - Sparse diagonal variance reconstruction from the edge predictor response.
 *  - Circuit-breaker helper based on max variance dimension.
 *  - Deterministic sampling and log-likelihood utilities.
 */

export interface VjepaDistribution {
  mean: number[];
  variance: number[];
}

export interface VjepaPredictorResponse {
  mu: number[];
  varIndices: number[];
  varValues: number[];
  meanVariance: number;
  maxVarianceDim: number;
  fallbackToSyntactic: boolean;
  totalMs: number;
  warmStart: boolean;
}

export interface VjepaPredictor {
  predict(state: { latentState: number[] }): Promise<VjepaPredictorResponse>;
  sample(distribution: VjepaDistribution, z?: number[]): number[];
  logLikelihood(distribution: VjepaDistribution, observedEmbedding: number[]): number;
}

export function degenerateVjepaDistribution(dim = 128): VjepaDistribution {
  return {
    mean: new Array<number>(dim).fill(0),
    variance: new Array<number>(dim).fill(0),
  };
}

export function sampleFromVjepa(distribution: VjepaDistribution, z?: number[]): number[] {
  const mean = distribution.mean;
  const variance = distribution.variance;
  const out = new Array<number>(mean.length);
  for (let i = 0; i < mean.length; i++) {
    const std = Math.sqrt(variance[i] ?? 0);
    const eps = z && i < z.length ? z[i] : (Math.random() * 2 - 1);
    out[i] = mean[i] + std * eps;
  }
  return out;
}

export function vjepaLogLikelihood(distribution: VjepaDistribution, observedEmbedding: number[]): number {
  const mean = distribution.mean;
  const variance = distribution.variance;
  if (mean.length !== observedEmbedding.length || mean.length !== variance.length) {
    return -Infinity;
  }

  let nll = 0;
  for (let i = 0; i < mean.length; i++) {
    const diff = observedEmbedding[i] - mean[i];
    const varVal = variance[i] > 1e-12 ? variance[i] : 1e-12;
    nll += 0.5 * Math.log(2 * Math.PI * varVal) + (diff * diff) / (2 * varVal);
  }
  return -nll;
}

// ─── VJEPA sparse-variance helpers ─────────────────────────────────────────

/**
 * Reconstruct a full-length variance vector from the sparse predictor response.
 * Missing indices are zero-variance.
 */
export function reconstructVariance(
  dim: number,
  varIndices: number[],
  varValues: number[],
): number[] {
  const out = new Array<number>(dim).fill(0);
  for (let i = 0; i < varIndices.length; i++) {
    const idx = varIndices[i];
    if (idx >= 0 && idx < dim) {
      out[idx] = varValues[i];
    }
  }
  return out;
}

/**
 * Compute the mean variance across all latent dimensions.
 */
export function meanVariance(variances: number[]): number {
  if (variances.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < variances.length; i++) sum += variances[i];
  return sum / variances.length;
}

/**
 * Circuit-breaker check: returns true when the prediction is too uncertain.
 */
export function isCircuitBreakerTripped(maxVarianceDim: number): boolean {
  return maxVarianceDim > 0.95;
}
