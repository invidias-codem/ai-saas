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
 * Computes the Product of Experts (PoE) for two diagonal Gaussians.
 * Used in BJEPA to fuse the dynamics model with a structural prior.
 */
export function computeProductOfExperts(
  dynMu: Float32Array | number[],
  dynVar: Float32Array | number[],
  priorMu: Float32Array | number[],
  priorVar: Float32Array | number[],
  epsilon = 1e-6,
): { poeMu: Float32Array; poeVar: Float32Array } {
  const dim = dynMu.length;
  const poeMu = new Float32Array(dim);
  const poeVar = new Float32Array(dim);

  for (let i = 0; i < dim; i++) {
    const varDyn = dynVar[i] + epsilon;
    const varPrior = priorVar[i] + epsilon;

    const lambdaDyn = 1.0 / varDyn;
    const lambdaPrior = 1.0 / varPrior;
    const lambdaPost = lambdaDyn + lambdaPrior;

    poeMu[i] = (lambdaDyn * dynMu[i] + lambdaPrior * priorMu[i]) / lambdaPost;
    poeVar[i] = 1.0 / lambdaPost;
  }

  return { poeMu, poeVar };
}

/**
 * Expands the sparse VJEPA variance payload into a dense 128-d array.
 * Unlisted indices are assigned the baseline variance to prevent
 * precision from approaching infinity and causing division-by-zero.
 */
export function expandSparseVariance(
  varIndices: number[],
  varValues: number[],
  dim = 128,
  baselineVariance = 0.01,
): Float32Array {
  const denseVar = new Float32Array(dim).fill(baselineVariance);
  for (let i = 0; i < varIndices.length; i++) {
    denseVar[varIndices[i]] = varValues[i];
  }
  return denseVar;
}

/**
 * Circuit-breaker check on posterior variance after PoE combination.
 */
export function isCircuitBreakerTripped(maxVarianceDim: number): boolean {
  return maxVarianceDim > 0.95;
}
