/**
 * Stochastic Differential Equation (Itô SDE) Simulator for Language Model Reasoning Trajectories
 */

export type ReasoningRegime = 'exploration' | 'commitment' | 'hallucination' | 'self_correction';

export class ItoSDESimulator {
  private readonly manifoldRank = 40;
  private readonly dt = 0.05;

  constructor() {}

  public predictHallucinationProbability(
    currentState: number[], 
    currentRegimeProbs: number[], 
    lookaheadSteps: number = 10
  ): number {
    let state = [...currentState];
    let probs = [...currentRegimeProbs];
    
    let cumulativeHallucinationRisk = 0;

    for (let step = 0; step < lookaheadSteps; step++) {
      // 1. Evolve the discrete latent state via state-dependent Markov transition
      probs = this.evolveLatentState(state, probs);
      
      // Accumulate risk (Probability we are in regime 2: hallucination)
      cumulativeHallucinationRisk += probs[2];
      
      // 2. Compute drift (μ) and diffusion (σ) based on new expected regime
      const drift = this.computeDrift(state, probs);
      const diffusion = this.computeDiffusion(state, probs);
      
      // 3. Euler-Maruyama integration step
      state = this.eulerMaruyamaStep(state, drift, diffusion);
    }

    return cumulativeHallucinationRisk / lookaheadSteps;
  }

  /**
   * Evolves the latent regime probabilities P(Z_{t+1} | Z_t, X_t)
   * If the trajectory magnitude gets large, the model loses its anchor and falls into hallucination.
   */
  private evolveLatentState(state: number[], probs: number[]): number[] {
    // Calculate L2 norm of the state vector
    const magnitude = Math.sqrt(state.reduce((sum, val) => sum + val * val, 0));
    
    // As magnitude grows > 10, chaos penalty spikes
    const chaosPenalty = Math.min(0.9, Math.max(0, (magnitude - 5) / 10));
    const stabilityBonus = Math.max(0, 1.0 - chaosPenalty);

    // State-dependent transition matrix
    const T = [
      // exp -> [exp, com, hal, cor]
      [0.60 * stabilityBonus, 0.30 * stabilityBonus, 0.10 + chaosPenalty, 0.00], 
      // com -> [exp, com, hal, cor]
      [0.05, 0.90 * stabilityBonus, 0.05 + chaosPenalty, 0.00], 
      // hal -> [exp, com, hal, cor]
      [0.00, 0.00, 0.85 + (chaosPenalty * 0.1), 0.15 * stabilityBonus], 
      // cor -> [exp, com, hal, cor]
      [0.40, 0.50 * stabilityBonus, 0.10 + chaosPenalty, 0.00]  
    ];

    // Normalize rows to ensure they sum to 1
    const normalizedT = T.map(row => {
      const sum = row.reduce((a, b) => a + b, 0);
      return row.map(v => v / sum);
    });

    const nextProbs = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        nextProbs[j] += probs[i] * normalizedT[i][j];
      }
    }
    return nextProbs;
  }

  private computeDrift(state: number[], regimeProbs: number[]): number[] {
    const drift = new Array(this.manifoldRank).fill(0);
    for (let i = 0; i < this.manifoldRank; i++) {
      const expPull = -0.1 * state[i] * regimeProbs[0];
      const comPull = -0.5 * state[i] * regimeProbs[1]; 
      const halPull = 1.2 * state[i] * regimeProbs[2]; // Divergent drift (exponential)
      const corPull = -0.9 * state[i] * regimeProbs[3];
      
      drift[i] = expPull + comPull + halPull + corPull;
    }
    return drift;
  }

  private computeDiffusion(state: number[], regimeProbs: number[]): number {
    return (
      1.0 * regimeProbs[0] + 
      0.1 * regimeProbs[1] + 
      3.5 * regimeProbs[2] + // High variance in hallucination
      0.5 * regimeProbs[3]
    );
  }

  private eulerMaruyamaStep(state: number[], drift: number[], diffusion: number): number[] {
    const nextState = new Array(this.manifoldRank).fill(0);
    const sqrtDt = Math.sqrt(this.dt);
    
    for (let i = 0; i < this.manifoldRank; i++) {
      const dW = this.gaussianRandom() * sqrtDt;
      nextState[i] = state[i] + drift[i] * this.dt + diffusion * dW;
    }
    return nextState;
  }

  private gaussianRandom(): number {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}
