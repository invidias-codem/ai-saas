# Bluesky Engagement Learning State Spec

## Purpose

This document defines the durable persistence model for Bluesky engagement learning in Genie AI / Tech Genie.

It exists because the Phase 2.5 in-memory learning store established the right behavior pattern, but durable learning is needed if the agent is going to improve over time across process restarts and deployment cycles.

The goal is to persist social interaction learning in a way that fits the existing Bluesky state model rather than creating a disconnected side channel.

---

## Design Principle

The engagement learning layer should store structured interaction evidence that helps the agent:
- recognize recurring questions
- identify repeated confusion themes
- detect recurring objections
- relate comments back to the topic/packet/post that triggered them
- improve future proactive posting and replies

It should not attempt to become a full analytics warehouse in v1.

---

## Recommended Table

### `bluesky_engagement_learning`

This table stores individual engagement-learning records derived from comments, mentions, and reply decisions.

---

## Proposed Fields

### Identity / timing
- `id`: UUID primary key
- `created_at`: TIMESTAMP WITH TIME ZONE default now()

### Source interaction identity
- `source_context`: TEXT
  - expected values:
    - `own_post_reply`
    - `mention`
    - `discovery_engagement`
- `author_did`: TEXT
- `author_handle`: TEXT
- `comment_uri`: TEXT nullable
- `comment_cid`: TEXT nullable

### Raw interaction content
- `comment_text`: TEXT
- `normalized_comment_text`: TEXT

### Classification / decision
- `comment_class`: TEXT
  - expected values aligned to reply classification types:
    - `technical_question`
    - `clarification_request`
    - `skepticism`
    - `product_curiosity`
    - `feature_request`
    - `compliment`
    - `noise`
- `action_taken`: TEXT
  - expected values:
    - `reply`
    - `like`
    - `skip`
- `rationale`: TEXT
- `suggested_reply_style`: TEXT nullable

### Topic / knowledge linkage
- `packet_id`: TEXT nullable
- `packet_title`: TEXT nullable
- `topic_key`: TEXT nullable

### Optional future evaluation fields
- `reply_text`: TEXT nullable
- `post_uri`: TEXT nullable
- `post_topic`: TEXT nullable
- `is_recurring_question_candidate`: BOOLEAN default false

---

## Why These Fields Matter

### `source_context`
Lets the system distinguish whether the interaction happened:
- under our own post
- as a direct mention
- in a discovery/engagement flow

This matters because those interaction surfaces behave differently.

### `normalized_comment_text`
Supports recurring-question aggregation without requiring immediate complex embeddings or clustering.

### `packet_id` and `packet_title`
Lets the system learn which topics generate confusion, curiosity, or skepticism most often.

### `comment_class` + `action_taken`
Creates the basis for analyzing whether the responder is:
- replying too much
- skipping too much
- attracting a certain class of questions repeatedly

---

## Recommended Indexes

At minimum, useful indexes would include:
- `created_at`
- `comment_class`
- `action_taken`
- `packet_id`
- `author_handle`

Optionally later:
- a partial or dedicated index for recurring-question candidate analysis

---

## Initial Use Cases

This durable table should support the following early queries:

### 1. What recurring questions are we getting?
Group by `normalized_comment_text` or later by richer clustering logic.

### 2. Which packet topics cause the most confusion?
Group by `packet_id` + `comment_class`.

### 3. Are we getting more skepticism or curiosity around a given topic?
Compare `comment_class` distribution per topic packet.

### 4. Are we over-replying or under-replying?
Inspect `action_taken` patterns across classes.

---

## Relationship to Existing Bluesky State

This table should be treated as complementary to existing Bluesky state such as:
- social memory
- proactive planner state
- topic state
- distribution state

It is not a replacement for those tables.
It is a focused learning surface for social interaction outcomes.

---

## V1 Simplicity Rule

Do not overbuild the first version.

V1 should:
- persist individual records cleanly
- support simple recurring-question summaries
- support packet/topic correlation

It does **not** need to solve:
- semantic clustering
- full sentiment analysis
- advanced thread attribution
- long-term social analytics dashboards

Those can come later.

---

## Next Steps

After this spec:
1. create the migration for `bluesky_engagement_learning`
2. wire `EngagementLearningStore` to insert records into Supabase
3. add a simple query path for recurring-question summaries
