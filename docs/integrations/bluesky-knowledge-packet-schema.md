# Bluesky Knowledge Packet Schema

## Purpose

This document defines the structure of a **knowledge packet** for the Genie AI / Tech Genie Bluesky agent.

The knowledge packet is the core unit that allows the agent to generate:
- grounded posts
- safe claims
- useful replies
- consistent messaging

It exists to prevent the agent from generating social content directly from vague repo awareness or raw hype language.

---

## Core Principle

The agent should not post from “general vibes.”

It should post from structured topic packets that answer:
- what happened
- why it matters
- what can be claimed safely
- what evidence supports the claim
- what people are likely to ask next

The knowledge packet is the bridge between:
- product reality
- repo/docs evidence
- social messaging

---

## Packet Objectives

Each knowledge packet should make it possible to:
- generate a specific product/social post
- answer likely replies/comments
- avoid overclaiming
- keep the agent aligned with real implementation and docs

---

## Packet Schema

A packet should contain the following conceptual fields.

## Required Core Fields

### `topic_id`
Unique identifier for the packet.

### `topic_title`
Human-readable title for the subject.

### `topic_type`
Examples:
- `feature_update`
- `architecture_explainer`
- `product_philosophy`
- `debug_lesson`
- `support_docs_update`
- `integration_update`

### `summary`
Short plain-language explanation of the topic.

### `safe_claim`
The strongest defensible public claim the agent is allowed to make.

### `why_it_matters`
Why a user, developer, or commenter should care.

### `evidence_sources`
Pointers to the concrete materials supporting the claim.
Examples:
- docs file paths
- ADRs
- merged commits
- live route changes
- issue/fix references

### `status`
One of:
- `live`
- `merged_not_verified_live`
- `documented_direction`
- `experimental`

This field is important for honesty.

---

## Safety / Precision Fields

### `anti_hype_boundary`
What the agent must **not** imply.

### `unsafe_claim_examples`
Examples of phrasings that are too broad, too vague, or too strong.

### `preferred_framing`
How the claim should usually be phrased instead.

### `confidence_level`
Internal confidence in how safely this topic can be discussed.
Examples:
- `high`
- `medium`
- `low`

---

## Social Generation Fields

### `post_angles`
A list of good ways to frame this topic in posts.

Examples:
- what changed
- why we changed it
- what we learned
- how it differs from naive AI UX

### `audience_fit`
Who this topic is most relevant to.
Examples:
- developers
- technical founders
- AI builders
- product-minded users
- integration-minded users

### `example_hooks`
Short opening lines the agent can use safely.

### `follow_up_questions_likely`
Questions a reader/commenter is likely to ask.

### `reply_seeds`
Short draft answer directions for those likely questions.

---

## Learning / Feedback Fields

### `recurring_confusions`
Known misunderstandings users tend to have about this topic.

### `objection_patterns`
Common skeptical reactions or objections.

### `docs_gap_signal`
Whether this topic repeatedly suggests missing docs or weak explanation surfaces.

---

## Optional Strategic Fields

### `linked_topics`
Related packets the agent could reference in follow-up posts or replies.

### `future_direction_note`
What is likely to evolve next without overstating present capabilities.

### `cta_style`
Whether the post should end with:
- no CTA
- read docs
- ask a question
- try feature
- review architecture update

---

## Example Packet Shape

```json
{
  "topic_id": "runtime-mode-routing-001",
  "topic_title": "Server-resolved runtime mode routing",
  "topic_type": "architecture_explainer",
  "summary": "Genie now documents and increasingly treats runtime behavior as a server-resolved decision based on conversation, workspace, and operating-profile context.",
  "safe_claim": "Genie is moving away from naive client-side chat mode toggles toward server-resolved runtime behavior shaped by application context.",
  "why_it_matters": "This makes the product more honest and gives the backend real control over behavior instead of letting the UI pretend it owns the final mode.",
  "evidence_sources": [
    "docs/architecture/runtime-mode-routing.md",
    "docs/decisions/adr-002-server-resolved-runtime-mode-routing.md"
  ],
  "status": "live",
  "anti_hype_boundary": "Do not imply that users have perfect profile-controlled agent behavior everywhere in the product.",
  "unsafe_claim_examples": [
    "Genie automatically understands exactly how you want every model to behave.",
    "Genie has fully autonomous adaptive intelligence routing."
  ],
  "preferred_framing": "Genie now documents and increasingly routes runtime behavior through backend context instead of pretending a frontend toggle is the whole system.",
  "confidence_level": "high",
  "post_angles": [
    "what changed",
    "why fake mode toggles are bad UX",
    "how workspace/profile context changes runtime routing"
  ],
  "audience_fit": [
    "developers",
    "technical founders",
    "AI product builders"
  ],
  "example_hooks": [
    "One thing we’re trying to be more honest about in Genie...",
    "A lot of AI products pretend the client controls the whole runtime. That breaks down fast."
  ],
  "follow_up_questions_likely": [
    "What do you mean by operating profile?",
    "Is this actually live or just planned?"
  ],
  "reply_seeds": [
    "Operating profile is the layer that helps shape how the backend should behave for a workspace.",
    "Parts of it are live now; other parts are clearly documented direction rather than fully mature execution."
  ],
  "recurring_confusions": [
    "people assume runtime modes are just UI switches",
    "people conflate docs direction with fully shipped behavior"
  ],
  "objection_patterns": [
    "this sounds like generic AI marketing",
    "isn’t this just another chatbot mode selector?"
  ],
  "docs_gap_signal": true,
  "linked_topics": [
    "workspace-operating-profile-001",
    "memory-context-001"
  ],
  "future_direction_note": "This routing becomes more meaningful as workspace memory and retrieval layers mature.",
  "cta_style": "read docs"
}
```

---

## Packet Construction Rules

### Rule 1
Every packet must be grounded in at least one real evidence source.

### Rule 2
Every packet must include an anti-hype boundary.

### Rule 3
Every packet must distinguish live behavior from directional architecture.

### Rule 4
Every packet must anticipate likely user questions.

### Rule 5
Packets should be reusable across both top-level posts and replies.

---

## Good Packet Characteristics

A strong packet is:
- specific
- evidence-backed
- reusable
- safe to speak from publicly
- connected to likely audience questions

A weak packet is:
- mostly vibes
- mostly roadmap fantasy
- missing evidence
- missing anti-hype boundaries
- too broad to generate a useful post from

---

## Recommended Packet Sources for Tech Genie / Genie AI

Strong packet topics include:
- workspace-first architecture
- runtime mode routing
- prepared context architecture
- memory/context direction
- public docs hub and transparency updates
- public/auth route-boundary lessons
- support flow improvements
- deployment truth vs runtime truth lessons
- retrieval/graph strategy
- operating profile model

---

## Relationship to Other Specs

This schema is intended to support:
- `docs/integrations/bluesky-agent-messaging-strategy.md`
- `docs/integrations/bluesky-reply-engagement-spec.md`

The messaging strategy defines **how to communicate**.
The reply engagement spec defines **how to engage**.
This schema defines **what structured knowledge the agent should communicate from**.

---

## Summary

The key idea is this:

**A Bluesky knowledge packet should turn a real product change or architectural idea into a safe, evidence-backed, reusable communication unit.**
