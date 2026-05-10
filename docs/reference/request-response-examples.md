# Request and Response Examples

## Purpose

This document provides concrete examples of request and response shapes for important Genie AI API surfaces.

It is meant to complement `docs/reference/api-reference.md` by making the platform easier to understand at the payload level.

This is not a full formal schema reference. It is a practical example guide.

---

## Why This Exists

Route names and high-level descriptions are useful, but they are often not enough to answer questions like:
- what does this route actually expect?
- what does a successful response look like?
- what should the frontend be prepared to render?
- what does a failure look like?

Example payloads make the system much more legible.

---

## `POST /api/chat`

### Example request
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Help me summarize the last conversation."
    }
  ],
  "conversationId": "conv_123",
  "workspaceId": "ws_456"
}
```

### Example response shape (conceptual)
```json
{
  "message": {
    "role": "assistant",
    "content": "Here is a summary of the last conversation..."
  }
}
```

### Debugging note
Actual runtime behavior for this route may also be validated through headers such as:
- `X-Debug-Agent-Mode`
- `X-Debug-Model`

---

## `GET /api/workspaces/default`

### Example response
```json
{
  "workspace": {
    "id": "ws_456",
    "name": "Default Workspace"
  }
}
```

### Example fallback response
```json
{
  "workspace": null
}
```

### Debugging note
This route often matters in workspace-aware routing flows. Schema truth and API runtime truth are both relevant when it fails.

---

## `POST /api/onboarding/complete`

### Example request
```json
{
  "workspaceName": "My Workspace",
  "profile": {
    "name": "Focused Builder",
    "priority": "quality"
  }
}
```

### Example success response
```json
{
  "success": true,
  "workspaceId": "ws_456",
  "operatingProfileId": "op_789"
}
```

### Example failure response
```json
{
  "success": false,
  "error": "Missing required schema objects"
}
```

### Debugging note
This route is especially sensitive to live schema truth.

---

## `POST /api/feedback`

### Example request
```json
{
  "message": "The new support page looks great.",
  "page": "/support"
}
```

### Example success response
```json
{
  "success": true
}
```

---

## `POST /api/support`

### Example request
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "subject": "Question about Slack integration",
  "message": "How do I invite Genie into a private channel?"
}
```

### Example success response
```json
{
  "success": true
}
```

### Example failure response
```json
{
  "success": false,
  "error": "Failed to send message"
}
```

---

## `POST /api/guest-chat`

### Example request
```json
{
  "message": "What is Genie AI?"
}
```

### Example response shape (conceptual)
```json
{
  "reply": "Genie AI is a workspace-centric AI platform..."
}
```

### Note
As a public route, this surface should be documented and monitored carefully for abuse resistance and scope clarity.

---

## Example Error Envelope

A useful general error shape for many routes is:

```json
{
  "status": "error",
  "error": "Unauthorized"
}
```

or more explicitly:

```json
{
  "status": "error",
  "error_code": "unauthorized",
  "message": "You must be signed in to access this resource."
}
```

### Note
Not every current route may follow this exact structure yet. Standardization remains a useful future improvement.

---

## Important Caveat

These examples are intended to improve legibility, not to claim every route is already perfectly standardized.

Where real route payloads diverge, those differences should either:
- be documented explicitly
- or be treated as candidates for future normalization
