# API Reference

## Purpose

This document provides a practical reference for important Genie AI API surfaces.

It is not intended to be a generated OpenAPI replacement. Instead, it is a human-readable operational reference for:
- developers
- maintainers
- collaborators
- reviewers

The emphasis is on clarity:
- what the route does
- whether it is public or protected
- what inputs and outputs matter
- what side effects to expect
- what truth surface to use when debugging it

---

## Scope

This reference prioritizes the most important API surfaces first.

It is not yet guaranteed to be exhaustive for every endpoint in the repo.
Where detail is still incomplete, the route should be treated as needing follow-up documentation rather than assumed undocumented forever.

---

## Route Classification Model

This reference uses the following route categories:

### Public
Accessible without normal user authentication, usually because the route supports public UX or external integration.

### Protected
Requires authenticated user context.

### Integration / Callback
Externally reachable for a narrow integration purpose. Reachability does not imply broad trust.

### Automation / Cron
Used by scheduled or background workflows.

---

## Core Product APIs

## `POST /api/chat`

### Category
- Protected

### Purpose
Primary chat execution route.

### Responsibilities
- receive chat requests
- resolve conversation/workspace context
- resolve effective runtime behavior on the server
- assemble prepared context
- execute provider/model flow
- return assistant response and related metadata

### Important architectural note
This route is a central example of server-resolved runtime behavior.
The client should not be treated as the final authority on effective mode selection.

### Likely related systems
- conversation state
- workspace state
- operating profiles
- prepared context layer
- runtime mode routing

### Debugging notes
Known debug headers have included:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

These are useful when verifying whether backend runtime routing matches expectations.

### Truth surface for debugging
- API runtime truth
- live runtime truth
- source-of-code truth

---

## `GET /api/conversations`
## `POST /api/conversations`

### Category
- Protected

### Purpose
Manage conversation collection state for authenticated users.

### Responsibilities
- list available conversations
- create or initialize conversation state depending on implementation path

### Architectural notes
Conversation state is increasingly important because it is no longer just a generic thread list; it can interact with workspace-aware behavior and runtime routing.

### Truth surface for debugging
- API runtime truth
- database/schema truth

---

## `POST /api/conversations/new`

### Category
- Protected

### Purpose
Create a new conversation flow entry point.

### Responsibilities
- initialize a new conversation
- potentially coordinate with workspace-aware routing behavior
- set up state expected by the UI when starting a new chat

### Truth surface for debugging
- API runtime truth
- database/schema truth
- frontend/runtime truth when route navigation is involved

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

### Category
- Protected

### Purpose
Fetch, update, or delete a specific conversation.

### Responsibilities
- resolve conversation by id
- enforce user-specific access expectations
- support conversation lifecycle operations

### Architectural note
Conversation deletion can have UI/state side effects, especially when the active conversation is being removed.

### Truth surface for debugging
- API runtime truth
- database/schema truth
- live runtime truth for navigation effects

---

## `GET /api/workspaces`
## `POST /api/workspaces`

### Category
- Protected

### Purpose
Manage workspace records.

### Responsibilities
- list or create workspaces
- support workspace-first product flows

### Architectural importance
Workspaces are central to the platform’s evolution from a generic chat/tool model to a more structured, runtime-aware architecture.

### Truth surface for debugging
- API runtime truth
- database/schema truth

---

## `GET /api/workspaces/default`

### Category
- Protected

### Purpose
Resolve the default workspace for the current user.

### Responsibilities
- return default workspace identity when present
- support routing flows that need a canonical workspace anchor

### Architectural note
This route matters for routing users into workspace-backed conversation flows rather than leaving them in a generic unscoped state.

### Truth surface for debugging
- API runtime truth
- database/schema truth
- live runtime truth for route behavior

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

### Category
- Protected

### Purpose
Manage operating-profile records.

### Responsibilities
- expose operating-profile state
- support profile-aware runtime behavior
- provide configuration surfaces for the workspace-first architecture

### Architectural note
Operating profiles are part of the move toward server-resolved, profile-aware runtime selection.

### Truth surface for debugging
- API runtime truth
- database/schema truth

---

## `GET /api/operating-profiles/default`

### Category
- Protected

### Purpose
Resolve the default operating profile for the current context/user.

### Architectural note
This route becomes especially important when onboarding or runtime routing expects profile-linked behavior.

### Truth surface for debugging
- API runtime truth
- database/schema truth

---

## `POST /api/onboarding/complete`

### Category
- Protected

### Purpose
Finalize onboarding and create/attach required product state.

### Responsibilities
- complete onboarding flow
- create or connect workspace/profile state as required
- move user from initial setup into product behavior

### Known risk class
This route is highly sensitive to schema truth.
If migrations exist in the repo but not in the live database, onboarding may fail even when code appears correct.

### Truth surface for debugging
- API runtime truth
- schema/database truth
- live runtime truth

---

## Public / Informational APIs

## `POST /api/guest-chat`

### Category
- Public

### Purpose
Support guest-facing or limited public chat behavior.

### Notes
Because this route is public, its scope and abuse resistance matter more than a normal internal product route.

### Truth surface for debugging
- API runtime truth
- public-route truth
- operational health truth

---

## `POST /api/feedback`

### Category
- Public

### Purpose
Accept feedback submissions.

### Notes
Even if public, it should still be treated as an externally reachable mutation surface with validation requirements.

### Truth surface for debugging
- API runtime truth
- operational health truth

---

## `POST /api/support`

### Category
- Public-facing support surface (implementation and auth expectations should be verified explicitly)

### Purpose
Accept support/contact messages from the support page.

### Notes
This route sits near a public page flow, so public/protected expectation mismatches should be checked carefully.

### Truth surface for debugging
- API runtime truth
- live runtime truth
- public-route truth

---

## Integration / Callback APIs

## Slack Integration Routes

### Current family
- `/api/integrations/slack/callback`
- `/api/integrations/slack/events`
- `/api/integrations/slack/command`
- `/api/integrations/slack/interactivity`
- `/api/integrations/slack/auth`

### Category
- Integration / Callback

### Purpose
Support Slack auth, event handling, slash commands, and interaction payloads.

### Important note
These routes may be transport-public, but they are not equivalent to general public UX routes. They must remain tightly validated for their specific callback purposes.

### Truth surface for debugging
- integration truth
- API runtime truth
- operational health truth

---

## `POST /api/integrations/telegram/webhook`

### Category
- Integration / Callback

### Purpose
Handle Telegram webhook traffic.

### Truth surface for debugging
- integration truth
- API runtime truth
- operational health truth

---

## `POST /api/webhooks/kofi`

### Category
- Integration / Callback

### Purpose
Handle Ko-fi webhook traffic.

### Truth surface for debugging
- integration truth
- API runtime truth

---

## `POST /api/webhooks/vercel-logs`

### Category
- Integration / Callback

### Purpose
Receive or process Vercel-related webhook/log events.

### Truth surface for debugging
- integration truth
- operational health truth

---

## Automation / Cron APIs

## `/api/cron(.*)`

### Category
- Automation / Cron

### Purpose
Host scheduled backend workflows.

### Examples of likely responsibilities
- social/distribution agent tasks
- maintenance/update tasks
- other scheduled system behavior

### Important note
These routes are often public in route-matcher terms for reachability reasons, but they should be treated as privileged automation boundaries, not broad public endpoints.

### Truth surface for debugging
- operational health truth
- API runtime truth
- integration truth when external triggers are involved

---

## Internal / Special-Purpose APIs

## `/api/internal/jklaw`
## `/api/internal/route-to-jklaw`

### Category
- Special-purpose / internal-facing route family

### Purpose
Narrow internal or special routing behavior.

### Note
These routes should remain clearly bounded and documented further if they stay live in production.

### Truth surface for debugging
- source-of-code truth
- API runtime truth
- trust-boundary review

---

## Common Debugging Guidance by Route Type

## Chat/runtime issue
Use:
- API runtime truth
- debug headers
- runtime mode routing doc
- live runtime truth

## Onboarding/workspace/profile issue
Use:
- schema/database truth
- API runtime truth
- source-of-code truth

## Public route/API issue
Use:
- public-route documentation
- middleware/proxy allowlist truth
- live logged-out route verification

## Integration failure
Use:
- integration truth
- callback logs
- provider-side event evidence

## Cron/automation failure
Use:
- operational health truth
- recurring job run history
- route-specific logs/results

---

## Related Docs

This reference should be read alongside:
- `docs/security/public-routes.md`
- `docs/security/trust-boundaries.md`
- `docs/architecture/runtime-mode-routing.md`
- `docs/operations/truth-surfaces.md`

---

## Planned Follow-Up Improvements

This API reference should later be expanded with:
- request body examples
- response body examples
- auth requirement summaries per route
- side-effect notes per route
- versioning notes where applicable
- explicit route-by-route source-file mapping if needed
