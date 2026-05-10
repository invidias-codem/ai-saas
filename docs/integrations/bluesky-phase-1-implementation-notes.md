# Bluesky Phase 1 Implementation Notes

## Scope

Phase 1 focuses on the fastest high-leverage changes:
- prompt discipline
- starter knowledge packets
- proactive topic grounding

This phase is intentionally smaller than a full stack rewrite.

---

## Phase 1 Deliverables

### 1. Prompt Upgrade
Updated:
- `lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md`

### 2. Starter Knowledge Packets
Added:
- `lib/agents/bluesky/knowledgePackets.ts`

### 3. Planning Direction
The proactive planner should begin choosing from packet-backed topic seeds rather than generic broad-topic generation.

---

## Recommended Immediate Code Wiring

### Minimal first wiring path
- import `STARTER_BLUESKY_KNOWLEDGE_PACKETS` inside `ProactivePostPlanner.ts`
- select one packet based on recency/topic freshness
- expose packet fields to the post-generation layer
- build post prompts from:
  - `safeClaim`
  - `whyItMatters`
  - `preferredFraming`
  - `antiHypeBoundary`

### Why this is enough for Phase 1
This improves post quality materially without requiring a full reply-classification or learning-store implementation yet.

---

## Initial Packet Topics Included
- public docs hub rewrite
- server-resolved runtime routing
- support page refocus
- prepared context / memory direction

These were chosen because they are:
- recent
- real
- explainable
- evidence-backed

---

## Next Phase Trigger

Move to Phase 2 when:
- proactive posts are visibly more concrete
- prompt behavior is stable enough to support reply improvements
- repeated user questions start surfacing in comments and should be handled more systematically
