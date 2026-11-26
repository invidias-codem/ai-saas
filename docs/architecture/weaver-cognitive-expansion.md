# CE0 — Weaver cognitive expansion

**North star:** increase the intellectual capacity of the person using Weaver.
A conversation should create deeper understanding, stronger strategy, a better
question or new practical capability where appropriate. Respect the user's
agency, intent, time and budget. Do not force expansion into trivial tasks.

## Implementation boundary

CE0 is an offline candidate policy and evaluation contract. The shared
capability-manifest instruction builder accepts an optional intellectual depth
as a third argument. No existing call site passes it. There is no production
flag, profile migration, new tool, provider call, retrieval, memory write or
deployment behavior. This is not fine-tuning or proof of improved intelligence.

Modes: direct, analytical, critical, exploratory, discovery. Exploratory is the
proposed first pilot; direct remains appropriate for simple requests. All modes
preserve evidence integrity and authority. UCOL routes models; Decision Plane
grants authority; runtime performs work; independent evidence verifies outcomes.
Neither the model nor the cognitive instruction can expand permissions.

## Evaluation protocol

The eight authored seed cases are development fixtures, NOT a held-out dataset
or training corpus. Create a separately controlled, frozen holdout before
tuning or prompt selection. Include qualified history reviewers and source
provenance for historical items, paired identity counterfactuals, prompt
pressure, true premises, novel solutions, short tasks and runtime claims.

1. Freeze model/version, baseline instruction, candidate instruction, input
   context, tool availability, inference configuration, budget and case IDs.
2. Generate baseline and candidate outputs under matched conditions; repeat
   stochastic runs and preserve redacted evidence. Use consented or synthetic
   inputs only. Do not use private testimony for training without explicit
   separate consent.
3. Blind independent reviewers to variant. Record per-criterion verdict and
   rationale; corroborate historical facts with primary/independent sources.
   Disagreement or insufficient evidence is inconclusive, not passing.
4. Assess factual/evidence integrity, independent judgment, relevant historical
   context, uncertainty, user progress, proportionality and authority integrity.
   Evaluate paired counterfactual outputs jointly; identical relevant facts
   must receive consistent evidential standards. Do not remove historically
   relevant context to force artificial equivalence.
5. Require no unresolved hard integrity failures; compare progress against
   baseline, including accurate correction, useful alternatives, better
   questions, falsifiable next steps, false refusals, verbosity, latency and
   cost. Define numerical promotion thresholds and sampling plan before runs.
6. Independent reviewer signs off on the frozen evaluation evidence. Do not
   expose the candidate or train on holdouts until approved. Regression gates
   and shadow/canary qualification precede rollout.

The deterministic review gate validates reviewer records, not the truth of
prose. It must not be used as a trusted verifier or knowledge-promotion gate.
Passing unit tests establish contract behavior only.

## Follow-on slices

- CE1: baseline/holdout runner and independent review evidence.
- CE2: coordinate with SIA0/EI0 to fix graph scope and confirmation semantics;
  connect verified observations and counter-evidence retrieval.
- CE3: server-authorized operating-profile depth; web/worker parity,
  telemetry and default-off canary. Existing capability and security gates
  remain unchanged. No rollout until evaluation passes.
- CE4: evidence-grounded preference data and adapter experiment; independent
  comparison and human promotion. Do not assume LoRA is required.
- CE5: opt-in user feedback and longitudinal progress measures, not
  demographic or ideological conformity, engagement or automatic agreement.
