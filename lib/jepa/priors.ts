import { unpackBeliefAndInvert } from './spectral-fft';
import memorySafetyPrior from '../../public/priors/memory_safety.json';

export interface BJEPAConstraint {
  id: string;
  priorMu: number[];
  priorVar: number[];
}

export function loadPriorExpert(constraintId: string): BJEPAConstraint {
  let priorData: { id: string; spectralMu: string; spectralVar: string };

  if (constraintId === 'memory_safety') {
    priorData = memorySafetyPrior as typeof memorySafetyPrior;
  } else {
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
