# UCOL x Seven Papers Isomorphism Mapping

This document maps the 7 foundational papers on Transformer internals (March 2026 convergence) directly to the Tech Genie / UCOL architecture.

## 1. Anthropic (2025): On the Biology of a Large Language Model
**Core Finding:** Circuit tracing, attribution graphs, planning as metastability (multiple candidate features held simultaneously before commitment).
**Tech Genie Correlation:** 
- **LearningBridge / Confidence Decay:** Our `LearningBridge` confidence scoring and `sonaMode` tiers map directly to their finding on how models hold features in "metastable basins". When a model is uncertain, it oscillates.
- **UCOL Router:** We route code to ContextRouter and strategy to JKlaw based on the exact kind of "feature circuits" Anthropic mapped.

## 2. Zeyuan Allen-Zhu (2024): Physics of Language Models
**Core Finding:** Universal laws governing intelligence (structure, reasoning, knowledge) independent of scale.
**Tech Genie Correlation:**
- **UCOL Toggle Modes:** Our UI toggle between Fast (Hermes 36B), Quality (Gemini), and Agentic (Claude) relies on this exact principle. We swap scales based on the dimensionality of the reasoning required.

## 3. König & Negrello (2026): The Neuroscience of Transformers
**Core Finding:** Encoder/decoder architecture maps to the laminar structure of the cortical column (Values = L4 feedforward, Keys = L2/3 tangential, Queries = L1 contextual feedback).
**Tech Genie Correlation:**
- **RFC-002: Multimodal Perceptual Layer (MPL):** Our 1408-dim unified embedding space is an exact software implementation of this biological finding. We are literally building the L1/L4 feedback loops using multimodal inputs (Vision + Audio + Text) collapsing into the same vector space.

## 4. Carson & Reisizadeh (2025): A Statistical Physics of Language Model Reasoning
**Core Finding:** Models reasoning as a stochastic dynamical system (Itô SDE). Found 4 reasoning regimes on a rank-40 manifold.
**Tech Genie Correlation:**
- **lib/world-model/ml/SimulationPredictor.ts:** This is the most direct correlation. They proved we can predict the trajectory of reasoning before the token is output. Our `SimulationPredictor` and `RoutingModel` (which currently uses 10-feature routing) can be upgraded using their rank-40 manifold math to perfectly predict when Gemini is about to hallucinate and instantly route to Claude instead.

## 5. Niu, Liu, Bi et al. (2025): LLMs and Cognitive Science
**Core Finding:** Integration with cognitive architectures, memory, sensory judgment.
**Tech Genie Correlation:**
- **Intelligent Memory System / lib/intelligentMemory.ts:** Our semantic fact ranking, sentiment analysis, and co-occurrence edges are effectively a cognitive architecture wrapper around the LLM, giving it the "sensory judgment" over its own memories that the paper describes.

## 6. Wenzhe Yang (2024): Geometrization of the Language Model
**Core Finding:** Defines moduli space of distributions, entropy function. Zero-entropy points explain why LLMs need billions of parameters.
**Tech Genie Correlation:**
- **RFC-001: World Model Root of Trust (WMRT):** Our WMRT (AXIOM -> CONFIRMED -> SUPPORTED) is a cryptographic enforcement of "zero-entropy points". We force the model to anchor to an immutable fact (zero entropy) to prevent hallucination cascades (wolf intervals).

## 7. Fernando & Guitchounts (2025): Transformer Dynamics
**Core Finding:** residual stream as a dynamical system, attractor-like self-correcting dynamics in lower layers.
**Tech Genie Correlation:**
- **Divergence Budgets:** In our World Model architecture, we proposed "divergence budgets" (agents get a drift limit before mandatory re-anchoring). This paper proves the math behind that drift. They mapped the unstable periodic orbits (~10.74 rotations), meaning we can calculate exactly how many tokens an agent can generate before it drifts out of its "attractor" and hallucinates.
