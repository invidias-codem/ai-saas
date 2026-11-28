/**
 * Hyperbolic geometry utilities for H-JEPA on the Poincaré ball.
 *
 * All operations assume vectors lie in the open unit ball:
 *   ||x|| < 1
 */

export function poincareNorm(x: number[]): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum);
}

export function projectToPoincare(x: number[], margin = 1e-6): number[] {
  const norm = poincareNorm(x);
  if (norm >= 1 - margin) {
    const scale = (1 - margin) / Math.max(norm, 1e-12);
    return x.map((v) => v * scale);
  }
  return x;
}

export function hyperbolicDistance(u: number[], v: number[]): number {
  const normU = poincareNorm(u);
  const normV = poincareNorm(v);
  const normDiff = poincareNorm(u.map((x, i) => x - v[i]));
  const denom = (1 - normU * normU) * (1 - normV * normV);
  if (denom <= 0) return Infinity;
  const val = 1 + 2 * (normDiff * normDiff) / denom;
  if (val <= 1) return 0;
  return Math.acosh(val);
}
