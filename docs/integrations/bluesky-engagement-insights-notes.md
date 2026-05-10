# Bluesky Engagement Insights Notes

## Purpose

This note documents the first lightweight reporting layer built on top of durable Bluesky engagement learning.

The goal is to summarize:
- recurring question patterns
- which knowledge-packet topics are generating confusion, skepticism, or curiosity

without forcing a full dashboard or admin analytics product immediately.

---

## Added Component

### `BlueskyEngagementInsights`

This helper provides two initial summary surfaces:

1. `getTopRecurringQuestions()`
2. `getTopPacketConfusion()`

---

## Why This Matters

The engagement-learning store was already recording interaction data.
This helper turns that raw data into something strategically usable.

It helps answer questions like:
- what are people repeatedly asking?
- which packet topics produce the most clarification pressure?
- where is skepticism clustering?
- which topics might need better proactive explanation next?

---

## Current Scope

This is intentionally a lightweight reporting layer.

It does not yet include:
- semantic clustering
- rich time-series analytics
- admin UI surfaces
- packet performance scoring models

Those can come later if the signal proves valuable.

---

## Recommended Next Uses

Strong next uses for these insights include:
- feeding top recurring questions into proactive topic planning
- refining packet language for the most confused topics
- identifying where docs or public explanations are still weak
