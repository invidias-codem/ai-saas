# Zapier Phase 0 Test Checklist

## Purpose
This is a copy-paste sanity-test checklist for the current Zapier Phase 0 endpoints.

It is meant to verify the first continuity slice end to end:
- auth
- workspace access boundaries
- workspace memory save
- workspace context retrieval
- fact extraction and persistence

This checklist should be used alongside:
- `docs/integrations/zapier-phase-0-api-examples.md`

---

## 0. Setup

Set these first:

```bash
export BASE_URL="https://gen1e.xyz"
export ZAPIER_KEY="YOUR_ZAPIER_WORKSPACE_KEY"
export WORKSPACE_ID="YOUR_WORKSPACE_ID"
```

Optional helpers:

```bash
AUTH_HEADER="Authorization: Bearer $ZAPIER_KEY"
JSON_HEADER="Content-Type: application/json"
```

### Pre-flight assumptions
Before testing, ensure:
- `ZAPIER_WORKSPACE_API_KEYS` is configured in runtime
- the chosen `WORKSPACE_ID` exists
- that workspace belongs to the `ownerUserId` mapped in the key config
- the deployed app is on a version that includes the Zapier Phase 0 routes

---

## 1. Auth failure test

### Goal
Confirm missing bearer auth fails closed.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/memory/save" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_auth_missing",
    "payload": {
      "content": "test auth failure",
      "memoryType": "fact"
    }
  }' | jq
```

### Expected
- unauthorized response
- `success: false`
- `error.code: "auth_required"`

---

## 2. Invalid key test

### Goal
Confirm invalid bearer token is rejected.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/memory/save" \
  -H "Authorization: Bearer invalid_key" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_invalid_key",
    "payload": {
      "content": "test invalid key",
      "memoryType": "fact"
    }
  }' | jq
```

### Expected
- `success: false`
- `error.code: "invalid_api_key"`

---

## 3. Workspace denial test

### Goal
Confirm workspace boundary enforcement.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/memory/save" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "00000000-0000-0000-0000-000000000000",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_workspace_denied",
    "payload": {
      "content": "test workspace denial",
      "memoryType": "fact"
    }
  }' | jq
```

### Expected
- `success: false`
- `error.code: "workspace_not_allowed"`

---

## 4. Save memory happy path

### Goal
Write a durable workspace memory.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/memory/save" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "operatingProfileId": null,
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_9001",
    "sourceUrl": "https://example.zendesk.com/tickets/9001",
    "userVisibleTitle": "OAuth timeout support case",
    "payload": {
      "content": "Customer reports OAuth timeout after token refresh in enterprise staging.",
      "memoryType": "fact",
      "tags": ["support", "oauth", "timeout", "staging"]
    },
    "memoryPolicy": {
      "mode": "store",
      "scope": "workspace",
      "importance": "high",
      "allowPromotion": false,
      "dedupKey": "zendesk:ticket_9001:oauth-timeout"
    },
    "metadata": {
      "customerId": "cust_test_1",
      "priority": "high"
    }
  }' | tee /tmp/zapier_save_memory.json | jq
```

### Expected
- `success: true`
- `operation: "save_memory_to_workspace"`
- `result.memoryId` exists
- `result.stored == true`
- `result.scope == "workspace"`

---

## 5. Save memory validation failure

### Goal
Confirm invalid payloads are rejected.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/memory/save" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_bad_payload",
    "payload": {
      "content": "",
      "memoryType": "fact"
    }
  }' | jq
```

### Expected
- `success: false`
- `error.code: "invalid_payload"`

---

## 6. Retrieve context happy path

### Goal
Retrieve the memory you just stored.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/context/retrieve" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_9001_followup",
    "sourceUrl": "https://example.zendesk.com/tickets/9001",
    "userVisibleTitle": "Follow-up OAuth timeout lookup",
    "payload": {
      "query": "OAuth timeout after token refresh in enterprise staging",
      "maxResults": 5
    },
    "memoryPolicy": {
      "mode": "retrieve",
      "scope": "workspace",
      "importance": "normal",
      "allowPromotion": false,
      "dedupKey": null
    }
  }' | tee /tmp/zapier_retrieve_context.json | jq
```

### Expected
- `success: true`
- `operation: "retrieve_relevant_context"`
- `result.resultCount >= 1`
- `result.items` includes the saved memory or a clear semantic match
- `result.contextSummary` is non-empty

---

## 7. Retrieve empty result test

### Goal
Confirm unrelated query returns a clean empty result.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/context/retrieve" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "zendesk",
    "sourceEntityType": "ticket",
    "sourceEntityId": "ticket_no_match",
    "payload": {
      "query": "totally unrelated astronomy payload with no matching workspace memory",
      "maxResults": 5
    }
  }' | jq
```

### Expected
- `success: true`
- `result.resultCount == 0`
- `result.items == []`

---

## 8. Fact extraction happy path

### Goal
Extract facts from realistic support text and persist them.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/facts/extract" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "gmail",
    "sourceEntityType": "email_thread",
    "sourceEntityId": "thread_12345",
    "sourceUrl": "https://mail.google.com/mail/u/0/#inbox/thread_12345",
    "userVisibleTitle": "Customer escalation email",
    "payload": {
      "text": "The outage began after yesterday'\''s token rotation and only affects the staging environment. The customer says enterprise users are timing out after OAuth refresh.",
      "schemaHint": "support_incident"
    },
    "memoryPolicy": {
      "mode": "store_and_retrieve",
      "scope": "workspace",
      "importance": "normal",
      "allowPromotion": false,
      "dedupKey": "gmail:thread_12345:fact_extract"
    }
  }' | tee /tmp/zapier_extract_facts.json | jq
```

### Expected
- `success: true`
- `operation: "extract_facts_from_payload"`
- `result.facts.length >= 1`
- ideally `result.storedMemoryIds.length >= 1`

---

## 9. Fact extraction validation failure

### Goal
Reject empty extraction text.

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/facts/extract" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "gmail",
    "sourceEntityType": "email_thread",
    "sourceEntityId": "thread_bad",
    "payload": {
      "text": "",
      "schemaHint": "support_incident"
    }
  }' | jq
```

### Expected
- `success: false`
- `error.code: "invalid_payload"`

---

## 10. Retrieval after extraction

### Goal
Prove compounding continuity:
- payload text → facts → stored memory → later retrieval

```bash
curl -sS -X POST "$BASE_URL/api/integrations/zapier/context/retrieve" \
  -H "$AUTH_HEADER" \
  -H "$JSON_HEADER" \
  -d '{
    "workspaceId": "'"$WORKSPACE_ID"'",
    "sourceApp": "gmail",
    "sourceEntityType": "email_thread",
    "sourceEntityId": "thread_12345_followup",
    "payload": {
      "query": "staging environment OAuth refresh timeout enterprise users",
      "maxResults": 5
    }
  }' | tee /tmp/zapier_retrieve_after_extract.json | jq
```

### Expected
- `success: true`
- `result.resultCount >= 1`
- returned items should now reflect the extracted facts as well

---

## Shortest High-Signal Path
If you only want the shortest real proof path, run these in order:
1. save memory happy path
2. retrieve context happy path
3. fact extraction happy path
4. retrieval after extraction

If those four work, the Phase 0 continuity wedge is real.

---

## Optional jq Helpers

### Pull memory id from save response
```bash
jq -r '.result.memoryId' /tmp/zapier_save_memory.json
```

### Count retrieved items
```bash
jq '.result.resultCount' /tmp/zapier_retrieve_context.json
```

### Count extracted facts
```bash
jq '.result.facts | length' /tmp/zapier_extract_facts.json
```

### Count stored fact memories
```bash
jq '.result.storedMemoryIds | length' /tmp/zapier_extract_facts.json
```

---

## What to Watch For

### Good signs
- structured success responses
- non-empty retrieval after save
- non-empty fact extraction
- retrieval improves after extraction

### Bad signs
- `workspace_not_allowed`
- `invalid_api_key`
- `memory_write_blocked`
- `retrieval_unavailable`
- extraction returns zero facts for obviously rich input
- retrieval remains empty after successful save/extract
