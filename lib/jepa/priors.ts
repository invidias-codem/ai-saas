import { unpackBeliefAndInvert } from './compression/spectral-fft';
import memorySafetyPrior from '../../public/priors/memory_safety.json';

export interface BJEPAConstraint {
  id: string;
  priorMu: number[];
  priorVar: number[];
}

const PRIOR_REGISTRY: Record<string, { id: string; spectralMu: string; spectralVar: string }> = {
  memory_safety: memorySafetyPrior as { id: string; spectralMu: string; spectralVar: string },
};

export function loadPriorExpert(constraintId: string): BJEPAConstraint {
  const priorData = PRIOR_REGISTRY[constraintId];
  if (!priorData) {
    throw new Error(`Unknown constraint ID: ${constraintId}`);
  }

  // Convert Base64 back to Uint8Array using Node/Edge-compatible Buffer
  const muBytes = new Uint8Array(Buffer.from(priorData.spectralMu, 'base64'));
  const varBytes = new Uint8Array(Buffer.from(priorData.spectralVar, 'base64'));

  return {
    id: priorData.id,
    // Decode continuous 128-d signals via inverse FFT
    priorMu: Array.from(unpackBeliefAndInvert(muBytes, 128)),
    priorVar: Array.from(unpackBeliefAndInvert(varBytes, 128)),
  };
}
