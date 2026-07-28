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

### Terminal / Raw SSE
Raw Server-Sent Event streams intended for CLI tools, integrations, and non-browser clients. These routes omit typical JSON envelopes and require explicit client parsers.

---

## Core Product APIs

## `POST /api/chat`

- Category: Protected
- Purpose: Primary chat execution route.
- Responsibilities: receive chat requests, resolve conversation and workspace context, execute provider/model flow, return assistant response metadata.
- Truth surface for debugging: API runtime truth, live runtime truth, source-of-code truth.

---

## `GET /api/conversations`
## `POST /api/conversations`

- Category: Protected
- Purpose: Manage conversation collection state for authenticated users.
- Responsibilities: list or create conversations, support workspace-aware routing.
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `POST /api/conversations/new`

- Category: Protected
- Purpose: Create a new conversation flow entry point.
- Responsibilities: initialize a new conversation and expected UI state.
- Truth surface for debugging: API runtime truth, database/schema truth, frontend/runtime truth.

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

- Category: Protected
- Purpose: Fetch, update, or delete a specific conversation.
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## `GET /api/workspaces`
## `POST /api/workspaces`

- Category: Protected
- Purpose: Manage workspace records.
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `GET /api/workspaces/default`

- Category: Protected
- Purpose: Resolve the default workspace for the current user.
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

- Category: Protected
- Purpose: Manage operating-profile records.
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `GET /api/operating-profiles/default`

- Category: Protected
- Purpose: Resolve the default operating profile for the current context/user.
- Truth surface for debugging: API runtime truth, database/schema truth.

---

## `POST /api/onboarding/complete`

- Category: Protected
- Purpose: Finalize onboarding and create/attach required product state.
- Known risk class: highly sensitive to schema truth.
- Truth surface for debugging: API runtime truth, database/schema truth, live runtime truth.

---

## Terminal / Raw SSE APIs

## `POST /api/cli/stream`

- Category: Terminal / Raw SSE
- Purpose: Stream assistant replies and local execution control envelopes for terminal-native consumers. This route is the bridge between the web app runtime and shell-driven CLI clients.
- Auth: bearer token when `LATTICE_CLI_TOKEN` is configured; otherwise unauthenticated in local setups.
- Request `Content-Type`: `application/json`
- Response `Content-Type`: `text/event-stream`
- Truth surface for debugging: API runtime truth, conversation engine truth, local CLI shim logs.

### Request shape

```json
{
  "messages": [
    {
      "role": "user",
      "text": "list files in the current project"
    }
  ],
  "options": {
    "localMode": true,
    "memoryPlan": null,
    "sudoPromptNames": ["BashSafety", "CLIStreamer", "ToolRouter"]
  }
}
```

### Example cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Notes

- Events are SSE frames with line-buffered framing.
- Local execution control envelopes arrive as JSON inside `data:` lines.
- Final completion is signaled by an event-name control frame rather than HTTP close alone.
- See `docs/reference/cli-stream-sse.md` for exact event taxonomy and parsing rules.

---

## `GET /api/memory/cli`

- Category: Terminal / Raw SSE API
- Purpose: Read and write CLI memory entries through a token-protected interface.
- Auth: Same bearer model as `/api/cli/stream`.
- Truth surface for debugging: API runtime truth, memory service truth, vector store truth.

### Example cURL

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN"
```

### Notes

- Use this for inspecting CLI memory reads/writes without the full dashboard path.
- Local shim memory writes route through this API in CLI-enabled flows.

---

## Feedback and support APIs

## `POST /api/feedback`

- Category: Protected
- Purpose: Submit feedback.
- Truth surface for debugging: API runtime truth, downstream transport truth.

## `POST /api/support`

- Category: Protected
- Purpose: Submit support messages.
- Truth surface for debugging: API runtime truth, downstream transport truth.

## `POST /api/guest-chat`

- Category: Public
- Purpose: Public guest chat surface.
- Known risk class: monitor for abuse exposure and scope clarity.
- Truth surface for debugging: API runtime truth, runtime mode routing truth.

---

## Error envelope guidance

Many routes return JSON error envelopes. The exact shape may not be fully standardized yet.

```json
{
  "error": "Unauthorized"
}
```

```json
{
  "status": "error",
  "error_code": "unauthorized",
  "message": "You must be signed in to access this resource."
}
```

Where differences remain, document explicit route behavior in this reference as needed.
