# Bluesky Phase 2.5 Engagement Learning Notes

## Purpose

This note captures the lightweight engagement-learning step added after reply classification.

The goal is not to build a full analytics or memory platform immediately.
The goal is to start recording the useful social signals that can later improve:
- future post planning
- reply quality
- recurring-question coverage
- product/docs clarity

---

## What Was Added

### `EngagementLearningStore`
A lightweight in-process store that captures:
- author handle
- comment text
- comment classification
- chosen action
- rationale
- linked knowledge packet, if present

### Responder Integration
`BlueskyResponder` now records decisions before acting on the mention.

---

## Immediate Value

This creates the first real mechanism for tracking:
- recurring questions
- repeated skepticism themes
- which packet topic a comment likely belongs to
- whether the agent is mostly replying, liking, or skipping a given class of interaction

---

## Current Limitation

This is intentionally lightweight.
It is currently:
- in-process
- not yet durable across restarts
- not yet wired to a DB-backed product memory layer

That is acceptable for the current step because the goal is to establish the behavioral shape before committing to persistence architecture.

---

## Next Likely Step

The next strong upgrade would be:
- persist engagement-learning records in durable storage
- summarize recurring questions into packet-improvement inputs
- surface repeated objections back into proactive topic planning
