import { unpackBeliefAndInvert } from './compression/spectral-fft';
import { MEMORY_SAFETY_PRIOR } from './priors/data';

export interface BJEPAConstraint {
  id: string;
  priorMu: number[];
  priorVar: number[];
}

const PRIOR_REGISTRY: Record<string, { id: string; spectralMu: string; spectralVar: string }> = {
  memory_safety: MEMORY_SAFETY_PRIOR,
};

export function loadPriorExpert(constraintId: string): BJEPAConstraint {
  const priorData = PRIOR_REGISTRY[constraintId];
  if (!priorData) {
    throw new Error(`Unknown constraint ID: ${constraintId}`);
  }

  const muBytes = new Uint8Array(Buffer.from(priorData.spectralMu, 'base64'));
  const varBytes = new Uint8Array(Buffer.from(priorData.spectralVar, 'base64'));

  return {
    id: priorData.id,
    priorMu: Array.from(unpackBeliefAndInvert(muBytes, 128)),
    priorVar: Array.from(unpackBeliefAndInvert(varBytes, 128)),
  };
}
