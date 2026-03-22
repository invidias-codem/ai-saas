import { SimulationPredictor } from '../lib/world-model/ml/SimulationPredictor';

async function runTests() {
  console.log("=== UCOL Simulation Predictor Tests ===\n");
  const predictor = new SimulationPredictor();

  // Test Case 1: A stable trajectory near the origin.
  // Represents a model confidently reasoning within a known domain.
  console.log("TEST 1: Stable Manifold Trajectory");
  const stableTrajectory = new Array(40).fill(0.1); 
  const res1 = await predictor.predictHallucinationRisk(stableTrajectory);
  console.log(`Risk Score: ${(res1.riskScore * 100).toFixed(2)}%`);
  console.log(`Halt Recommended: ${res1.shouldHalt}`);
  console.log(`Reason: ${res1.reason}\n`);

  // Test Case 2: A chaotic, high-magnitude trajectory.
  // Represents a model spiraling into an ungrounded hallucination.
  console.log("TEST 2: Chaotic Divergent Trajectory");
  const chaoticTrajectory = new Array(40).fill(3.5); 
  const res2 = await predictor.predictHallucinationRisk(chaoticTrajectory);
  console.log(`Risk Score: ${(res2.riskScore * 100).toFixed(2)}%`);
  console.log(`Halt Recommended: ${res2.shouldHalt}`);
  console.log(`Reason: ${res2.reason}\n`);
}

runTests().catch(console.error);
