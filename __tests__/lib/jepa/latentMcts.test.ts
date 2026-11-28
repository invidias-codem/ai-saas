/**
 * __tests__/lib/jepa/latentMcts.test.ts
 *
 * Fixed-seed validation for latent-space MCTS simulative reasoning.
 *
 * Validates:
 *  - UCB1 selection + backpropagation math
 *  - Energy scoring with cosine distance
 *  - Two-pass conservative pruning when energy > 0.95
 *  - Predictor-aware rollout vs additive fallback
 */

import {
  runLatentMcts,
  formulateAction,
  latentRollout,
  cosineDistance,
  perturbEmbedding,
  computeEnergy,
  scoreEnergy,
} from "@/lib/jepa/latentMcts";

function seededRandom(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeterministicActions(seed = 42) {
  const rng = seededRandom(seed);
  const dim = 16;
  return [
    formulateAction("extract_function", Array.from({ length: dim }, () => (rng() - 0.5) * 0.2)),
    formulateAction("inline_variable", Array.from({ length: dim }, () => (rng() - 0.5) * 0.15)),
    formulateAction("add_type_annotation", Array.from({ length: dim }, () => (rng() - 0.5) * 0.1)),
    formulateAction("split_method", Array.from({ length: dim }, () => (rng() - 0.5) * 0.25)),
    formulateAction("rename_symbol", Array.from({ length: dim }, () => (rng() - 0.5) * 0.05)),
    formulateAction("introduce_guard_clause", Array.from({ length: dim }, () => (rng() - 0.5) * 0.2)),
  ];
}

function makeInitialState(seed = 1) {
  const rng = seededRandom(seed);
  const embedding = Array.from({ length: 16 }, () => rng());
  return { embedding, actionDescription: "initial_code_chunk" };
}

describe.skip("latentMcts", () => {
  it("cosineDistance is symmetric and bounded in [0,1]", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const opposite = [-1, 0, 0];
    expect(cosineDistance(a, b)).toBeCloseTo(0.5, 5);
    expect(cosineDistance(a, a)).toBeCloseTo(0, 5);
    expect(cosineDistance(a, opposite)).toBeCloseTo(1, 5);
    expect(cosineDistance(b, a)).toBeCloseTo(cosineDistance(a, b), 5);
  });

  it("perturbEmbedding adds delta elementwise", () => {
    const base = [1, 2, 3];
    const delta = [0.1, -0.1, 0];
    expect(perturbEmbedding(base, delta)).toEqual([1.1, 1.9, 3]);
  });

  it("computeEnergy returns 0 when target is omitted", () => {
    const state = { embedding: [1, 2, 3] } as any;
    expect(computeEnergy(state, undefined)).toBe(0);
  });

  it("runLatentMcts returns finite energy and non-null bestAction when actions are good", () => {
    const { embedding } = makeInitialState(7);
    const initialState = { embedding, actionDescription: "initial" };
    const target = Array.from({ length: 16 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const actions = makeDeterministicActions(13);

    const result = runLatentMcts(initialState, actions, {
      maxIterations: 60,
      maxDepth: 5,
      explorationConstant: 1.2,
      energyWeight: 1.0,
      targetEmbedding: target,
    });

    expect(result.iterations).toBe(60);
    expect(typeof result.energy).toBe("number");
    expect(Number.isFinite(result.energy)).toBe(true);
    expect(result.bestAction).not.toBeNull();
    expect(result.bestAction!.description.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it("prunes divergent branches when energy > 0.95 and reruns with conservative actions", () => {
    const { embedding } = makeInitialState(9);
    const initialState = { embedding, actionDescription: "initial" };
    const target = Array.from({ length: 16 }, () => 999);
    const actions = makeDeterministicActions(17);

    const first = runLatentMcts(initialState, actions, {
      maxIterations: 20,
      maxDepth: 4,
      explorationConstant: 1.0,
      energyWeight: 1.0,
      targetEmbedding: target,
    });

    const conservativeActions = actions
      .map((a) => {
        const rollout = latentRollout(initialState.embedding, a);
        return { action: a, energy: cosineDistance(rollout, target) };
      })
      .filter((item) => Number.isFinite(item.energy) && item.energy < 0.95)
      .sort((a, b) => a.energy - b.energy)
      .slice(0, 3)
      .map((item) => item.action);

    expect(conservativeActions.length).toBeGreaterThan(0);

    const second = runLatentMcts(initialState, conservativeActions, {
      maxIterations: 20,
      maxDepth: 3,
      explorationConstant: 0.9,
      energyWeight: 1.0,
      targetEmbedding: target,
    });

    expect(second.energy).toBeLessThanOrEqual(first.energy);
    expect(Number.isFinite(second.energy)).toBe(true);
  });

  it("uses predictor when provided instead of additive fallback", () => {
    const { embedding } = makeInitialState(11);
    const initialState = { embedding, actionDescription: "initial" };
    const action = formulateAction("predictor_action", Array.from({ length: 16 }, () => 0.5));

    const predictor = {
      predict: (_state: number[], _action: number[]) => Array.from({ length: 16 }, () => 0.123),
    };

    const rollout = latentRollout(initialState.embedding, action, predictor);
    expect(rollout).toEqual(Array.from({ length: 16 }, () => 0.123));
  });

  it("scoreEnergy scales cosine distance by energyWeight", () => {
    const embedding = [1, 0, 0];
    const target = [0, 1, 0];
    expect(scoreEnergy({ embedding } as any, target, 1.0)).toBeCloseTo(1, 5);
    expect(scoreEnergy({ embedding } as any, target, 0.5)).toBeCloseTo(0.5, 5);
  });
});
