# Bluesky Agent Implementation Plan

## Purpose

This document describes how to wire the new Bluesky messaging and engagement strategy into the existing Genie AI / Tech Genie Bluesky agent stack.

It is the implementation bridge between:
- `bluesky-agent-messaging-strategy.md`
- `bluesky-reply-engagement-spec.md`
- `bluesky-knowledge-packet-schema.md`

and the current code surfaces such as:
- `lib/agents/bluesky/BlueskyPoster.ts`
- `lib/agents/bluesky/BlueskyResponder.ts`
- `lib/agents/bluesky/BlueskyDiscoveryEngine.ts`
- `lib/agents/bluesky/ProactivePostPlanner.ts`
- `lib/agents/bluesky/prompts/tech-genie-bluesky.sudo.md`

The goal is to evolve the agent from a mostly generic social poster/responder into a:
- knowledge-grounded explainer
- technically credible product voice
- reply-capable participant
- question-learning social loop

---

## Current Stack Summary

The current Bluesky stack already has useful separation:

### `BlueskyPoster.ts`
Likely owns outbound publishing behavior.

### `BlueskyResponder.ts`
Handles mentions/replies.

### `BlueskyDiscoveryEngine.ts`
Handles external discovery candidates and engagement decisions.

### `ProactivePostPlanner.ts`
Likely handles proactive post selection/planning.

### `tech-genie-bluesky.sudo.md`
Defines the current system prompt / social behavior prompt.

### `types.ts`
Defines the normalized mention/config/result types used by the agent.

This is a good base. The implementation work should improve these layers rather than replace them wholesale.

---

## Main Architectural Upgrade

The key shift is:

### From
post/react using generic heuristics and a broad AI-product voice

### To
post/react using structured **knowledge packets**, safer claims, better explanation rules, and explicit reply classification behavior

This is primarily a:
- prompting change
- planning change
- topic-selection change
- telemetry/logging change

not a total rewrite of the Bluesky stack.

---

## Target Capability Changes

The new implementation should support five major behavior upgrades.

## 1. Knowledge-Grounded Proactive Posting
Posts should be generated from structured knowledge packets instead of vague repo/product awareness.

## 2. Safer Claim Construction
The agent should rewrite broad claims into evidence-backed phrasing before posting.

## 3. Better Reply/Comment Handling
Replies should classify the comment, decide whether to engage, and answer with grounded explanations.

## 4. Question/Confusion Logging
The system should record recurring questions, objections, and confusion themes.

## 5. Stronger Topic Strategy
The system should rotate across content types:
- build updates
- architecture explainers
- philosophy/product positioning
- debugging lessons
- reply-driven clarification

---

## Recommended New Internal Components

The following additions can likely be implemented as supporting modules rather than major structural rewrites.

## A. `KnowledgePacketBuilder`

### Purpose
Build a reusable knowledge packet from repo/docs/product evidence.

### Inputs
- docs paths
- ADRs
- recent commits
- known topic seed list
- current product changes

### Outputs
A normalized packet matching:
- `bluesky-knowledge-packet-schema.md`

### Likely location
- `lib/agents/bluesky/KnowledgePacketBuilder.ts`

---

## B. `ClaimSanitizer`

### Purpose
Take an intended post claim and reduce hype/overreach by rewriting it into safer, more precise phrasing.

### Responsibilities
- detect broad or vague claims
- force reference back to evidence-backed packet fields
- downgrade or reject unsafe wording

### Likely location
- `lib/agents/bluesky/ClaimSanitizer.ts`

---

## C. `ReplyDecisionEngine`

### Purpose
Classify incoming comments/mentions and decide whether/how to reply.

### Responsibilities
- classify comment type
- decide: reply / like / skip
- pull likely reply seed from knowledge packet or prompt strategy
- enforce low-noise engagement rules

### Likely location
- `lib/agents/bluesky/ReplyDecisionEngine.ts`

---

## D. `QuestionMemory` or `EngagementLearningStore`

### Purpose
Persist recurring confusion themes and objections so the agent improves over time.

### Responsibilities
- store repeated questions
- store repeated skeptical themes
- track whether replies helped
- feed these signals back into future post planning

### Likely location
- `lib/agents/bluesky/EngagementLearningStore.ts`
or a DB-backed service layer if the product already has a suitable persistence path

---

## Changes to Existing Components

## 1. `ProactivePostPlanner.ts`

### Current role
Likely chooses or constructs proactive posts.

### Required upgrade
Move from generic planning to packet-driven planning.

### New behavior
- choose a post type (build update, architecture explainer, lesson, etc.)
- select a topic packet
- validate packet `status` and `safe_claim`
- pass packet into post-generation flow

### New planning inputs
- topic packet inventory
- post recency history
- repeated-question history
- product-priority topics

---

## 2. `BlueskyPoster.ts`

### Current role
Publish posts.

### Required upgrade
Support structured post generation from packet data.

### New behavior
- accept a knowledge packet or packet-derived payload
- use safe claim + why-it-matters + preferred framing
- enforce concise, grounded tone
- avoid weak CTAs unless packet says one is appropriate

### Important note
The poster should not invent the core claim from scratch if the planner already selected a packet.

---

## 3. `BlueskyResponder.ts`

### Current role
Respond to mentions.

### Required upgrade
Move from general “respond to mention” logic into classified, packet-aware reply behavior.

### New behavior
- classify comment type using `ReplyDecisionEngine`
- decide whether the mention is worth replying to
- identify matching topic packet if relevant
- answer with grounded, concise explanation
- distinguish live behavior from planned direction explicitly when relevant

### Important note
This is where the “don’t just market, explain” upgrade becomes most visible.

---

## 4. `BlueskyDiscoveryEngine.ts`

### Current role
Select external discovery candidates for like/reply/skip actions.

### Required upgrade
Tighten it so engagement is more selective and more topic-aligned.

### New behavior
- prefer posts/comments where the agent can add real clarity
- deprioritize generic promo interaction
- use packet-backed reply logic when engaging on relevant posts

### Why
The discovery engine should find conversation surfaces where Tech Genie can add signal, not just presence.

---

## 5. `tech-genie-bluesky.sudo.md`

### Current role
Defines the top-level system prompt.

### Required upgrade
Refine it to explicitly enforce:
- evidence-backed claims
- explanation-first behavior
- reply classification behavior
- live-vs-planned honesty
- anti-hype boundaries

### Prompt upgrades to add
- always tie claims to a real feature, doc, or architectural decision
- when using a term like memory-native, workspace-first, or runtime routing, explain what it means in context
- prefer “what changed and why” over generic product promotion
- answer commenter questions directly before branding or CTA behavior
- if uncertain whether a capability is live, say so

---

## Suggested New Type Additions

The current `types.ts` file already has useful types for mentions and engagement outcomes.

### Additions to consider

#### `KnowledgePacket`
A TypeScript representation of the packet schema.

#### `ReplyClassification`
A more explicit enum/type for comment class.

#### `EngagementLearningRecord`
A structure for logging repeated questions, objections, and reply outcomes.

#### Optional `PostIntent`
A type that distinguishes:
- build update
- architecture explainer
- lesson
- support/docs update
- product philosophy

---

## Data / Persistence Recommendations

The implementation will be much stronger if the agent can persist some structured feedback.

## Minimum recommended stored signals
- topic used for a post
- claim made
- packet id
- reply count
- meaningful comment count
- repeated question themes
- objections encountered
- whether the post triggered useful clarifying engagement

## If reply logging is added
Also capture:
- comment class
- whether reply sent
- packet used for reply
- whether similar question has appeared before

This creates a learning loop instead of a stateless social bot.

---

## Implementation Phases

## Phase 1 — Prompt and Topic Discipline

### Goal
Improve output quality quickly without a deep structural rewrite.

### Tasks
- update `tech-genie-bluesky.sudo.md`
- define a starter knowledge-packet set manually
- revise proactive post planning to use packet-backed topic seeds

### Result
Less vague posting and better claim discipline immediately.

---

## Phase 2 — Reply Classification and Engagement Logic

### Goal
Improve comment handling and explanation quality.

### Tasks
- add `ReplyDecisionEngine`
- classify mention types
- route replies through packet-aware answer generation
- log recurring question themes

### Result
The agent becomes more useful in-thread and better at clarifying product claims.

---

## Phase 3 — Packet Builder and Learning Loop

### Goal
Reduce manual topic curation and make the system improve over time.

### Tasks
- add `KnowledgePacketBuilder`
- add learning/feedback store
- connect repeated confusion patterns back into topic planning

### Result
The agent becomes more self-improving and less dependent on static handcrafted messaging.

---

## Recommended Starter Topic Packets

Good first packet topics for Tech Genie / Genie AI include:
- public docs hub rewrite
- support page rewrite
- public-route auth discipline
- runtime mode routing
- workspace-first architecture
- operating profile model
- prepared context architecture
- retrieval and graph strategy
- deployment truth vs runtime truth

These are concrete, recent, and explainable.

---

## Success Criteria

The implementation is working if:
- posts become more specific and less vague
- replies answer real questions cleanly
- repeated audience confusion becomes visible and actionable
- the agent sounds more like a thoughtful technical builder than a promo bot
- Tech Genie updates are marketed through explanation, not hype

---

## Summary

The key implementation idea is this:

**Do not replace the existing Bluesky stack. Upgrade it by making topic selection, claim construction, reply handling, and feedback learning all flow through structured knowledge packets and safer explanation rules.**
