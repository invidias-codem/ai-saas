# Zapier Phase 0 API Examples

## Purpose
This document is a small implementation-facing companion to the Zapier Phase 0 endpoints now present in the repo.

It is meant to help with:
- endpoint sanity testing
- Zapier app setup
- payload debugging
- first template wiring

Phase 0 currently covers three endpoints:
- `POST /api/integrations/zapier/memory/save`
- `POST /api/integrations/zapier/context/retrieve`
- `POST /api/integrations/zapier/facts/extract`

---

## 1. Auth / Env Example

## Current auth model
Phase 0 uses a workspace-scoped bearer key model.

### Request header
```http
Authorization: Bearer <zapier_workspace_key>
Content-Type: application/json
```

### Environment example
Current helper expects:
- `ZAPIER_WORKSPACE_API_KEYS`

Example value:
```json
[
  {
    "id": "zapier-dev-key-1",
    "label": "Zapier Dev Workspace Key",
    "key": "zapier_ws_dev_abc123",
    "ownerUserId": "user_123",
    "allowedWorkspaceIds": ["ws_abc123"],
    "active": true
  }
]
```

### Important note
This is a Phase 0 beta auth path.
It is intentionally simple and should later evolve into a more durable key-management or OAuth path.

---

## 2. Save Memory to Workspace

### Endpoint
`POST /api/integrations/zapier/memory/save`

### Example request
```json
{
  "workspaceId": "ws_abc123",
  "operatingProfileId": null,
  "sourceApp": "zendesk",
  "sourceEntityType": "ticket",
  "sourceEntityId": "ticket_456",
  "sourceUrl": "https://example.zendesk.com/agent/tickets/456",
  "userVisibleTitle": "Ticket 456 customer follow-up",
  "payload": {
    "content": "Customer confirmed the API timeout only happens after OAuth refresh.",
    "memoryType": "fact",
    "tags": ["support", "oauth", "timeout"]
  },
  "memoryPolicy": {
    "mode": "store",
    "scope": "workspace",
    "importance": "high",
    "allowPromotion": false,
    "dedupKey": "zendesk:ticket_456:oauth-timeout"
  },
  "metadata": {
    "customerId": "cust_001",
    "priority": "high"
  }
}
```

### Example success response
```json
{
  "success": true,
  "operation": "save_memory_to_workspace",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "9df88fe2-4a9c-40d4-88d6-4d5d4e8d92bb",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "result": {
    "memoryId": "mem_789",
    "stored": true,
    "scope": "workspace",
    "tags": ["support", "oauth", "timeout"]
  },
  "warnings": []
}
```

### Example invalid workspace/auth response
```json
{
  "success": false,
  "operation": "save_memory_to_workspace",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "f6f7d6ec-0fe3-4d6d-a2cb-a5df4a70ce06",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "error": {
    "code": "workspace_not_allowed",
    "message": "Workspace access denied for this Zapier credential.",
    "retryable": false
  },
  "warnings": []
}
```

---

## 3. Retrieve Relevant Context

### Endpoint
`POST /api/integrations/zapier/context/retrieve`

### Example request
```json
{
  "workspaceId": "ws_abc123",
  "sourceApp": "intercom",
  "sourceEntityType": "conversation",
  "sourceEntityId": "conv_999",
  "sourceUrl": "https://app.intercom.com/a/inbox/example/inbox/conversation/999",
  "userVisibleTitle": "Intercom escalation",
  "payload": {
    "query": "API timeout after OAuth refresh for enterprise customer",
    "maxResults": 5
  },
  "memoryPolicy": {
    "mode": "retrieve",
    "scope": "workspace",
    "importance": "normal",
    "allowPromotion": false,
    "dedupKey": null
  }
}
```

### Example success response
```json
{
  "success": true,
  "operation": "retrieve_relevant_context",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "6d255a9a-b9ec-4e06-b2ee-30b535d56f4f",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "result": {
    "contextSummary": "## User's Relevant Previous Work\nBelow are similar interactions this user has done before...",
    "items": [
      {
        "id": "mem_1",
        "title": "OAuth refresh timeout root cause...",
        "content": "Enterprise customer saw API timeouts after OAuth refresh because older scopes remained active.",
        "type": "fact",
        "similarity": 0.86
      }
    ],
    "resultCount": 1
  },
  "warnings": []
}
```

### Example empty result response
```json
{
  "success": true,
  "operation": "retrieve_relevant_context",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "9474c2de-d1f9-4334-8b5f-2573759fb85f",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "result": {
    "contextSummary": "",
    "items": [],
    "resultCount": 0
  },
  "warnings": []
}
```

---

## 4. Extract Facts from Payload

### Endpoint
`POST /api/integrations/zapier/facts/extract`

### Example request
```json
{
  "workspaceId": "ws_abc123",
  "sourceApp": "gmail",
  "sourceEntityType": "email_thread",
  "sourceEntityId": "thread_123",
  "sourceUrl": "https://mail.google.com/mail/u/0/#inbox/thread_123",
  "userVisibleTitle": "Customer escalation email",
  "payload": {
    "text": "The customer says the outage began after yesterday's token rotation and only affects the staging environment.",
    "schemaHint": "support_incident"
  },
  "memoryPolicy": {
    "mode": "store_and_retrieve",
    "scope": "workspace",
    "importance": "normal",
    "allowPromotion": false,
    "dedupKey": "gmail:thread_123:fact_extract"
  }
}
```

### Example success response
```json
{
  "success": true,
  "operation": "extract_facts_from_payload",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "c34ca92f-9996-4e17-8eb7-3ddeedc040eb",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "result": {
    "facts": [
      {
        "type": "project",
        "content": "Outage began after token rotation.",
        "confidence": 0.91
      },
      {
        "type": "project",
        "content": "Issue affects staging environment.",
        "confidence": 0.88
      }
    ],
    "storedMemoryIds": ["mem_10", "mem_11"]
  },
  "warnings": []
}
```

### Example validation failure response
```json
{
  "success": false,
  "operation": "extract_facts_from_payload",
  "workspaceId": "ws_abc123",
  "trace": {
    "requestId": "2f5bb15e-c5ec-4c46-9f81-6a1041c66f06",
    "timestamp": "2026-05-17T21:00:00.000Z"
  },
  "error": {
    "code": "invalid_payload",
    "message": "Invalid Zapier fact extraction payload.",
    "retryable": false
  },
  "warnings": [
    "payload.text: String must contain at least 1 character(s)"
  ]
}
```

---

## 5. End-to-End Support Workflow Example

## Template concept
**Autonomous Customer Success Engineer**

### Goal
Use Lattice OS to give a support workflow continuity across prior tickets and new issue details.

### Flow
#### Step 1 — Trigger
A new Zendesk or Intercom ticket arrives.

Example source event:
- customer reports API timeout after OAuth refresh
- enterprise account
- prior similar incidents may exist

#### Step 2 — Retrieve prior context
Call:
- `POST /api/integrations/zapier/context/retrieve`

Input query example:
- `API timeout after OAuth refresh for enterprise customer`

Expected outcome:
- prior similar issue context comes back
- workflow no longer starts stateless

#### Step 3 — Extract facts from the new ticket
Call:
- `POST /api/integrations/zapier/facts/extract`

Expected outcome:
- new ticket details become structured facts
- facts are also stored back into workspace memory

#### Step 4 — Draft enriched response downstream
Use the retrieved context + extracted facts in a downstream AI drafting step or Slack/internal response draft.

Expected outcome:
- response is more specific
- repeated context restatement is reduced
- prior issue history shapes the response

#### Step 5 — Save final resolution note
Call:
- `POST /api/integrations/zapier/memory/save`

Expected outcome:
- final outcome gets written into workspace memory
- future tickets become smarter because the workflow remembers

---

## Before vs After Story

### Before
- ticket arrives
- generic AI draft
- no awareness of prior cases
- repeated explanation across tools

### After
- ticket arrives
- Lattice retrieves prior relevant context
- new facts are extracted and persisted
- response reflects prior history and current specifics
- final resolution becomes part of future workflow memory

### Core takeaway
Without Lattice OS, each workflow run starts half-amnesiac.
With Lattice OS, the workflow accumulates reusable context over time.

---

## Testing Notes

### Recommended manual test order
1. test `memory/save` with a known workspace id
2. test `context/retrieve` after at least one saved memory exists
3. test `facts/extract` with a realistic support/email payload
4. then run the full support workflow sequence end to end

### Important caveat
The retrieval endpoint currently returns the existing internal `contextString` shape from workspace memory retrieval. That is acceptable for Phase 0, but later we may want a cleaner plain-text summary field specifically for non-prompt downstream Zap steps.

## Related Pages
- `knowledge/research/zapier-native-api-contract-spec.md`
- `knowledge/research/zapier-phase-0-implementation-slice.md`
- `knowledge/research/zapier-phase-0-coding-plan.md`
