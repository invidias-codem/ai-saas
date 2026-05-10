# Bluesky Durable Engagement Learning Implementation Notes

## Scope

This step upgrades the Bluesky engagement-learning layer from in-memory-only behavior to Supabase-backed persistence.

The goal is to keep the existing lightweight interaction-learning shape while making it survive:
- restarts
- redeploys
- multi-run agent behavior

---

## Added Pieces

### Durable state spec
- `docs/integrations/bluesky-engagement-learning-state-spec.md`

### Migration
- `supabase/migrations/20260510000000_bluesky_engagement_learning.sql`

### Supabase-backed learning store
- `lib/agents/bluesky/EngagementLearningStore.ts`

### Responder integration update
- `lib/agents/bluesky/BlueskyResponder.ts`

---

## Behavioral Upgrade

The responder now records engagement-learning events durably for:
- skip decisions
- like decisions
- reply decisions

When replying, it also stores the final reply text.

---

## What This Enables

This creates a durable basis for future improvements such as:
- recurring question summaries
- repeated objection detection
- packet-topic feedback loops
- better proactive post planning based on real audience confusion

---

## Current Constraints

This is still intentionally moderate in scope.
It does not yet provide:
- semantic clustering
- advanced analytics dashboards
- full thread graphing
- long-term scoring of reply success

Those can be added later if the signal quality justifies the complexity.
