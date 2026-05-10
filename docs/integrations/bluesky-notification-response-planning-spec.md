# Bluesky Notification Response Planning Spec

## Purpose

This document defines how the Genie AI / Tech Genie Bluesky agent should parse notifications and proactively plan responses.

It exists because notification handling should not be a blind “reply to everything that mentions us” loop.

The goal is to turn notifications into a structured decision flow that can:
- detect relevant questions
- identify clarification opportunities
- recognize skepticism worth answering
- ignore or defer low-value noise
- connect interactions back to knowledge packets and future proactive posting

---

## Core Principle

Notifications should be **parsed, classified, and planned** before reply generation.

The agent should not assume every notification deserves an immediate text response.

A better model is:
1. ingest notification
2. classify it
3. determine relevance and value
4. link it to a knowledge packet if possible
5. decide whether to reply, like, skip, or defer
6. generate a grounded response plan

---

## Notification Types of Interest

The system should care most about notifications that are likely to contain real interaction value.

## High-priority types
- reply to one of our posts
- mention asking a question
- skeptical challenge under a product/architecture post
- feature request relevant to active product direction

## Medium-priority types
- compliments that might merit light acknowledgment
- broader product curiosity
- comment threads that expose repeated confusion

## Low-priority types
- generic noise
- low-value social filler
- bad-faith trolling
- interactions with no real question or signal

---

## Planning Questions

For each notification, the planner should answer:

1. Is this notification relevant?
2. What kind of interaction is it?
3. Is it worth a reply, a like, a defer, or nothing?
4. Is there an existing knowledge packet that grounds the answer?
5. Is this question recurring enough to matter beyond the one reply?
6. Should this interaction influence future proactive posting?

---

## Recommended Notification Classification

The notification planner should use or extend the existing reply classification model.

### Primary classes
- `technical_question`
- `clarification_request`
- `skepticism`
- `product_curiosity`
- `feature_request`
- `compliment`
- `noise`

### Optional future classes
- `docs_gap_signal`
- `support_request`
- `roadmap_probe`

---

## Decision Outcomes

The planner should support these core outcomes:

### `reply_now`
The notification is valuable, answerable, and should be answered immediately.

### `like_only`
The interaction is positive but does not need a substantive response.

### `skip`
The interaction is low-value, redundant, or not worth engaging.

### `defer_for_topic`
The notification should influence future proactive posting or docs refinement even if it is not answered immediately.

### `escalate`
The notification touches a topic the agent should not answer autonomously, such as legal/financial/sensitive matters or high-uncertainty product claims.

---

## Relevance Rules

A notification should be considered highly relevant when:
- it asks what a real product term means
- it challenges a concrete claim in a way that can be clarified
- it exposes confusion around an actively marketed topic
- it asks whether a claimed feature is actually live
- it reveals mismatch between product language and user understanding

These are exactly the interactions the agent should learn from.

---

## Knowledge Packet Linking

Every meaningful planned response should attempt to link to a relevant packet.

### Why
A packet gives the response planner:
- safe claim boundaries
- evidence source context
- likely follow-up question patterns
- reply seeds
- live-vs-directional honesty cues

### If no packet matches
The planner should:
- answer narrowly if confidence is still acceptable
- or defer/escalate if the claim boundary is unclear

---

## Recurring Question Detection

A notification should be flagged as strategically important when it appears to reflect a repeated confusion theme.

### Signals
- same normalized question showing up multiple times
- same packet linked to repeated clarification requests
- recurring skepticism about one topic
- repeated “is this actually live?” questions

### Why this matters
These questions should shape:
- future proactive posts
- packet refinement
- docs improvements
- product/support language

---

## Suggested Response Planning Output

A notification planner should produce something like:

```ts
{
  action: "reply_now" | "like_only" | "skip" | "defer_for_topic" | "escalate",
  commentClass: "technical_question" | ...,
  packetId?: string,
  rationale: string,
  confidence: number,
  responseStyle?: "direct" | "clarifying" | "skeptical" | "curious" | "warm",
  shouldLogAsRecurringQuestionCandidate: boolean
}
```

This gives the responder a cleaner decision surface.

---

## Proactive Planning Feedback Loop

A major reason to parse notifications well is that replies should influence future posts.

### Example
If many notifications ask:
- “What do you mean by operating profile?”

then the system should:
1. answer those comments
2. mark the theme as recurring
3. increase priority for a future architecture explainer post on that topic

This is how notification parsing becomes part of marketing strategy rather than just customer-service behavior.

---

## Proposed New Component

### `BlueskyNotificationPlanner`

#### Responsibilities
- ingest raw notifications/mentions/replies
- classify them
- link them to packets
- decide reply/like/skip/defer/escalate
- expose response plans for downstream handling

#### Relationship to existing components
- uses `ReplyDecisionEngine`
- uses `EngagementLearningStore`
- may later influence `ProactivePostPlanner`
- should feed `BlueskyResponder` cleaner decision inputs

---

## v1 Scope Rule

Do not overbuild the first version.

### v1 should do
- classify notification relevance
- decide immediate action
- connect to packet-backed grounding
- flag recurring-question candidates

### v1 should not try to do yet
- full thread-level social reasoning
- semantic clustering over all historical notifications
- advanced ranking models
- autonomous long-horizon discussion management

---

## Success Criteria

This planning layer is working if:
- fewer low-value notifications get replies
- high-value questions get better answers faster
- recurring confusion themes become visible
- posts and replies start reinforcing each other more intelligently
- the agent becomes more useful without becoming noisier

---

## Summary

The key idea is this:

**Bluesky notifications should be treated as planning inputs, not just raw triggers for automatic replies.**
