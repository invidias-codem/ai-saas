/**
 * lib/jepa/vjepa.ts
 *
 * Variational JEPA (VJEPA) interface for uncertainty-aware planning.
 *
 * In this serverless stage the predictor is represented as a typed
 * capability boundary. The concrete distribution head will be provided
 * by offline training; here we expose the operational contract:
 *
 *  - mean:  μ_T, the predicted latent state
 *  - variance: Σ_T, the predictive covariance
 *  - sample(): draw one state from N(μ, Σ) via reparameterization
 *  - logLikelihood(): density of an observed latent under the distribution
 *
 * Fallback determinism: when variance is unavailable, treat Σ=0 and
 * return a degenerate Gaussian over μ.
 */

export interface VjepaDistribution {
  mean: number[];
  variance: number[];
}

export interface VjepaPredictor {
  predict(state: { astTokens: string[]; language: string; embedding?: number[] }): Promise<VjepaDistribution>;
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
