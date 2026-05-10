# Bluesky Notification Planner Implementation Notes

## Scope

This step implements the first notification-aware planning layer for the Bluesky agent.

The goal is to stop treating incoming mentions as raw automatic reply triggers and instead convert them into structured notification plans.

---

## Added Component

### `BlueskyNotificationPlanner`

Responsibilities:
- classify the notification/comment
- link it to a relevant knowledge packet when possible
- choose one of:
  - `reply_now`
  - `like_only`
  - `skip`
  - `defer_for_topic`
  - `escalate`
- estimate confidence
- flag recurring-question candidate status

---

## Responder Change

`BlueskyResponder` now consumes notification plans rather than making reply decisions directly from raw text.

This makes the reply flow easier to reason about and easier to extend later.

---

## Immediate Benefits

This step improves:
- relevance filtering
- comment handling clarity
- packet-aware response planning
- future ability to defer comments into proactive topic planning

---

## Current Limitations

This planner is intentionally lightweight.
It does not yet:
- ingest a broader Bluesky notification feed beyond the mention surface being passed in
- maintain long-horizon notification queues
- perform semantic clustering of comments
- escalate into a human-in-the-loop workflow automatically

Those are future expansion paths.

---

## Next Likely Step

Strong next upgrades would include:
- feeding deferred topics into proactive planning
- durable reporting for repeated objections/questions by packet
- smarter packet matching
- optional notification queue prioritization
