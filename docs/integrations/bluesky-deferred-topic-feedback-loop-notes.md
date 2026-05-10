# Bluesky Deferred Topic Feedback Loop Notes

## Purpose

This note documents the first feedback loop from notification handling back into proactive posting.

The goal is simple:
- if a packet topic repeatedly generates deferred questions, skepticism, or other interactions worth revisiting,
- the proactive planner should become more likely to choose that packet in future posts.

---

## What Was Added

### EngagementLearningStore
Now exposes:
- `getDeferredPacketCounts()`

This provides a lightweight signal for which packet topics are generating deferred interaction pressure.

### ProactivePostPlanner
Now consults deferred packet counts when selecting the next topic packet.

This means proactive posting can start responding to what people keep asking about, not just a static topic list.

---

## Why This Matters

This is the first real closed loop between:
- social replies/notifications
- audience confusion or curiosity
- future proactive messaging

That is a meaningful upgrade from a simple one-way posting bot.

---

## Current Scope

This loop is intentionally simple.
It does not yet:
- semantically cluster related questions
- score topic performance deeply
- distinguish positive curiosity from negative confusion statistically

But it does establish the most important pattern:

**questions and deferrals can influence what we explain next.**
