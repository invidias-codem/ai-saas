# Bluesky Phase 2 Implementation Notes

## Scope

Phase 2 focuses on reply classification and engagement control.

The goal is to move the Bluesky agent from generic mention replies toward:
- classified interaction handling
- selective engagement
- packet-grounded clarifications
- safer, more useful reply behavior

---

## Phase 2 Deliverables

### 1. ReplyDecisionEngine
A decision layer that classifies comment type and returns:
- reply
- like
- skip

### 2. Comment Classification Types
Shared types for:
- technical questions
- clarification requests
- skepticism
- product curiosity
- feature requests
- compliments
- noise

### 3. Responder Wiring
`BlueskyResponder.ts` now routes mentions through the decision engine and builds replies using relevant packet context where available.

---

## Immediate Benefits

This phase improves:
- reply quality
- selectivity
- skepticism handling
- consistency between proactive messaging and reactive replies

It also gives the agent a cleaner surface for future learning/logging work.

---

## Next Likely Step

A strong Phase 2.5 / Phase 3 improvement would be:
- logging repeated questions and objections
- storing reply outcomes
- using those signals to refine future proactive posting
