import { ItoSDESimulator } from '../ItoSDESimulator';
import { SimulationPredictor } from '../SimulationPredictor';

describe('ItoSDESimulator', () => {
  let simulator: ItoSDESimulator;

  beforeEach(() => {
    simulator = new ItoSDESimulator();
  });

  describe('predictHallucinationProbability', () => {
    it('should assign a low hallucination probability to stable vectors near origin', () => {
      // Simulate a stable vector (e.g. well-grounded facts, high commitment)
      const stableState = new Array(40).fill(0.1); 
      // [P(exp), P(com), P(hal), P(cor)] - assume starting in exploration/commitment
      const initialProbs = [0.7, 0.3, 0.0, 0.0]; 

      const risk = simulator.predictHallucinationProbability(stableState, initialProbs, 15);
      
      // The probability should remain low (< 0.45)
      expect(risk).toBeLessThan(0.45);
      expect(risk).toBeGreaterThan(0.0);
    });

    it('should assign a high hallucination probability to chaotic, high-magnitude vectors', () => {
      // Simulate a divergent vector (e.g. ungrounded, drifting far from the basin)
      const chaoticState = new Array(40).fill(4.5);
      const initialProbs = [0.7, 0.3, 0.0, 0.0];

      const risk = simulator.predictHallucinationProbability(chaoticState, initialProbs, 15);
      
      // The probability should be very high due to state-dependent transition penalties
      expect(risk).toBeGreaterThan(0.80);
    });
  });
});

describe('SimulationPredictor', () => {
  let predictor: SimulationPredictor;

  beforeEach(() => {
    predictor = new SimulationPredictor();
  });

  it('should recommend Halt=false for stable trajectories', async () => {
    const stableState = new Array(40).fill(0.05); 
    const result = await predictor.predictHallucinationRisk(stableState);

    expect(result.shouldHalt).toBe(false);
    expect(result.riskScore).toBeLessThan(0.45);
    expect(result.reason).toContain('Trajectory is stable');
  });

  it('should recommend Halt=true for unstable/hallucination trajectories', async () => {
    const chaoticState = new Array(40).fill(3.0); 
    const result = await predictor.predictHallucinationRisk(chaoticState);

    expect(result.shouldHalt).toBe(true);
    expect(result.riskScore).toBeGreaterThan(0.45);
    expect(result.reason).toContain('probability of hallucination cascade');
  });
});
