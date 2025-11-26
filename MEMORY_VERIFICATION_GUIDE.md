# Memory Retention Verification Guide

This guide shows you how to verify that the Genie AI conversation API is successfully retaining user memory, including names and previous conversations.

## How Memory Retention Works

```
┌─────────────────────────────────────────────────────────┐
│ 1. User sends message to /api/conversation/route.ts     │
├─────────────────────────────────────────────────────────┤
│ 2. System extracts userId from Clerk authentication      │
├─────────────────────────────────────────────────────────┤
│ 3. RAG retrieval fetches relevant past memories          │
│    • Queries: /retrieveMemories Cloud Function          │
│    • Uses semantic search via Vertex AI embeddings       │
│    • Returns up to 5 most similar past interactions      │
├─────────────────────────────────────────────────────────┤
│ 4. Past memories are injected into Gemini prompt         │
│    • Format: "User's Relevant Previous Work"             │
│    • Includes: Titles, summaries, tags, feature types    │
├─────────────────────────────────────────────────────────┤
│ 5. Gemini responds with personalized context             │
├─────────────────────────────────────────────────────────┤
│ 6. Current interaction is captured asynchronously        │
│    • Calls: /captureConversationMemory Cloud Function    │
│    • Stores: User query, AI response, metadata, tags     │
│    • Creates: Vector embedding for semantic search       │
└─────────────────────────────────────────────────────────┘
```

---

## Verification Methods

### Method 1: Browser DevTools Network Inspection

**What to look for:** Confirm API calls are being made and returning memory data.

#### Step 1: Open DevTools
1. Open Genie AI in your browser
2. Press `F12` (or `Cmd+Option+I` on Mac) to open DevTools
3. Click the **Network** tab
4. Filter by "Fetch/XHR"

#### Step 2: Send a Test Message
1. Go to any feature (e.g., Conversation, Code Generation)
2. Send a message like: *"My name is Alex and I work as a data scientist"*

#### Step 3: Inspect the Request
1. In Network tab, find the request to `/api/conversation`
2. Check the **Headers** tab
   - Should have `Authorization` header (Clerk token)
   - Should be POST request
3. Check the **Payload** tab
   - See the message you sent
4. Check the **Response** tab
   - Should get 200 status code
   - Response includes model answer

#### Step 4: Verify Memory Capture
1. After 1-2 seconds, check if another request appears for `/captureConversationMemory`
2. This confirms the interaction was saved to memory

**Expected Output:**
```json
// Response from /api/conversation
{
  "text": "Hi Alex! Data science is a fascinating field. How can I help you with that today?"
}

// After capture, in console logs you might see:
"Memory captured successfully for userId: user_2abc123"
```

---

### Method 2: Firestore Direct Inspection

**What to look for:** Actual stored memory records in Firestore database.

#### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select **genie-ai-1ca85** project
3. Go to **Firestore Database**

#### Step 2: Navigate to User Data
1. Click **Collections** panel (left sidebar)
2. Find **users** collection
3. Click on any **user document** (ID looks like `user_2abc123`)
4. You should see nested **memories** collection

#### Step 3: Inspect Memory Documents
Each memory document should contain:
```json
{
  "id": "mem_abc123xyz",
  "userId": "user_2abc123",
  "featureType": "conversation",
  "title": "Data Science Discussion",
  "summary": "User introduced themselves as Alex, a data scientist...",
  "tags": ["introduction", "data-science", "career"],
  "messages": [...],
  "tokensUsed": 245,
  "embedding": [0.123, 0.456, ..., -0.789],  // 768-dim vector
  "createdAt": "2025-11-25T14:32:10.000Z",
  "updatedAt": "2025-11-25T14:32:10.000Z"
}
```

#### Step 4: Check Memory Count
1. In each user's collection, count the memories
2. After 3-4 interactions, you should see 3-4 memory documents
3. Memories are organized by `createdAt` timestamp

**What each field tells you:**
- `title` - What this interaction was about
- `summary` - AI-generated description of the conversation
- `tags` - Semantic keywords extracted from the conversation
- `embedding` - Vector representation (768 dimensions from Vertex AI)
- `messages` - Full conversation history stored
- `tokensUsed` - Token count estimation

---

### Method 3: Check Memory Context in Browser Console

**What to look for:** Verify that retrieved memories are being injected into prompts.

#### Step 1: Enable Logging
1. In `/app/api/conversation/route.ts`, you can add logging to see retrieved memory
2. Or check the browser console for logs

#### Step 2: Open Browser Console
1. Press `F12` and click the **Console** tab
2. Send a message in the conversation

#### Step 3: Look for Memory Logs
The system logs memory retrieval. You should see something like:
```
✓ Retrieved 3 memories for query: "tell me about machine learning"
  Memory 1: "Previous ML Discussion" (similarity: 0.87)
  Memory 2: "Python Deep Learning Project" (similarity: 0.82)
  Memory 3: "Data Preprocessing Techniques" (similarity: 0.79)
```

**Interpreting similarity scores:**
- **0.90-1.0**: Highly relevant (definitely related)
- **0.70-0.89**: Very relevant (good context)
- **0.50-0.69**: Somewhat relevant (tangentially related)
- **0.0-0.49**: Not relevant (filtered out usually)

---

### Method 4: End-to-End Conversation Test

**What to look for:** AI actually using previous memories to provide context-aware responses.

#### Test Scenario A: User Introduces Themselves
1. **Message 1:** *"Hi! My name is Jamie and I'm learning React"*
   - AI responds generically: "Hi Jamie! Learning React is great..."
   - Memory captures: name, learning goal, topic

2. **Wait 2-3 seconds** (let memory capture complete)

3. **Message 2:** *"What's the best way to learn?"*
   - AI should reference previous message: "Since you're learning React, I'd recommend..."
   - This shows memory retrieval worked!

4. **Message 3:** *"Can you show me an example?"*
   - AI should provide React-specific example
   - Proves it remembered your previous learning context

#### Test Scenario B: Cross-Conversation Memory (If Implemented)
1. In **Code** feature: *"Show me a React hook example"*
   - Memory stores: React hook, code generation context

2. Return to **Conversation** feature
3. Send: *"Can you write a tutorial for beginners?"*
   - If memory works: "Based on the React hook you were working on..."
   - This proves cross-feature memory works!

#### What Success Looks Like
- ✅ First message: Generic greeting
- ✅ Second message: References your name or previous topic
- ✅ Third message: Continues context naturally
- ✅ Responses become progressively more personalized

#### What Failure Looks Like (No Memory)
- ❌ Each message treated independently
- ❌ No reference to previous context
- ❌ AI asks "What's your name?" even after you said it
- ❌ Responses always generic

---

### Method 5: Cloud Functions Logs

**What to look for:** Confirm memory capture and retrieval functions are executing.

#### Step 1: Access Cloud Functions Logs
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Search for **Cloud Functions**
3. Select **genie-ai-1ca85** project
4. Click **captureConversationMemory** function
5. Go to **Logs** tab

#### Step 2: Send a Test Message
1. Return to Genie AI and send a conversation message

#### Step 3: Check Function Execution
Look for log entries like:
```
2025-11-25 14:35:22 INFO: captureConversationMemory called
  userId: user_2abc123
  featureType: conversation
  tokenCount: 245
  
2025-11-25 14:35:23 INFO: Memory stored successfully
  memoryId: mem_456def
  embeddingDim: 768
  indexedAt: rag_index_xyz
```

#### Step 4: Check Retrieval Logs
1. Click **retrieveMemories** function
2. Go to **Logs** tab
3. Look for retrieval events:
```
2025-11-25 14:35:20 INFO: retrieveMemories called
  userId: user_2abc123
  query: "tell me about data science"
  featureType: conversation
  
2025-11-25 14:35:21 INFO: Retrieved 3 memories
  topMemory: "Data Science Discussion" (similarity: 0.89)
```

**Interpreting logs:**
- ✅ No errors = functions executing correctly
- ❌ "No memories found" = User has no past interactions yet (expected on first use)
- ❌ "Failed to generate embedding" = Vertex AI API issue
- ❌ "Firestore write failed" = Database permissions issue

---

## Quick Diagnostic Checklist

Use this checklist to diagnose any memory retention issues:

### Configuration ✓
- [ ] `NEXT_PUBLIC_RAG_ENABLED=true` in `.env.local`
- [ ] `RAG_CLOUD_FUNCTION_URL` is set correctly
- [ ] Firebase credentials configured properly
- [ ] Cloud Functions deployed: `firebase deploy --only functions`

### API Layer ✓
- [ ] `/api/conversation/route.ts` imports RAG utilities
- [ ] `getRAGMemoryContext()` called before Gemini
- [ ] `captureMemory()` called after response
- [ ] No errors in Network tab requests

### Cloud Functions ✓
- [ ] `captureConversationMemory` function deployed
- [ ] `retrieveMemories` function deployed
- [ ] `firebase functions:list` shows all 7 functions
- [ ] No "Function failed" errors in Cloud Functions logs

### Database ✓
- [ ] Firestore has `users/{userId}/memories` collection
- [ ] Memory documents have `embedding` field (768 dimensions)
- [ ] `createdAt` timestamps are current
- [ ] No Firestore quota exceeded errors

### User Experience ✓
- [ ] Second message references first message context
- [ ] AI remembers user's name after being told
- [ ] Responses become progressively personalized
- [ ] Cross-feature memory works (optional)

---

## Manual Test Commands

### Test Memory Retrieval (via Cloud Function)

```bash
# Get your cloud function URL from Firebase
RAG_URL="https://us-central1-genie-ai-1ca85.cloudfunctions.net"
USER_ID="user_2abc123"  # Replace with actual user ID

# Retrieve memories for a user
curl -X POST "$RAG_URL/retrieveMemories" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"query\": \"data science\",
    \"featureType\": \"conversation\",
    \"limit\": 5
  }"
```

Expected response:
```json
{
  "success": true,
  "memories": [
    {
      "id": "mem_123",
      "title": "Data Science Discussion",
      "summary": "User described their role as a data scientist...",
      "tags": ["data-science", "career"],
      "similarity": 0.87
    }
  ],
  "count": 1
}
```

### Test Memory Capture (via Cloud Function)

```bash
curl -X POST "$RAG_URL/captureConversationMemory" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"featureType\": \"conversation\",
    \"title\": \"Test Memory\",
    \"summary\": \"This is a test memory to verify capture\",
    \"messages\": [],
    \"tokensUsed\": 150,
    \"tags\": [\"test\"]
  }"
```

Expected response:
```json
{
  "success": true,
  "memoryId": "mem_456",
  "message": "Memory captured successfully"
}
```

---

## Common Issues & Solutions

### Issue: "No memories found"
**Cause:** User has no previous interactions yet
**Solution:** Send 2-3 messages first, then subsequent messages should show memory injection

### Issue: "404 on /retrieveMemories"
**Cause:** Function not deployed or URL incorrect
**Solution:** Run `firebase deploy --only functions` and verify URL in `.env.local`

### Issue: AI still generic on second message
**Cause:** Memory capture not completing before next request
**Solution:** Wait 2-3 seconds between messages during testing, or check Cloud Function logs for errors

### Issue: "Failed to generate embedding"
**Cause:** Vertex AI API not enabled or credentials invalid
**Solution:** Check GCP project settings, enable Vertex AI API, verify service account JSON

### Issue: Firestore storage not appearing
**Cause:** Permissions issue or user ID mismatch
**Solution:** Check Firestore security rules, verify userId matches Clerk auth

---

## Performance Metrics to Track

Once memory is working, monitor these metrics:

| Metric | Healthy Range | Description |
|--------|---------------|-------------|
| Memory Retrieval Time | 100-500ms | Time to fetch from Firestore |
| Embedding Generation | 200-800ms | Time to generate Vertex AI vector |
| Memory Count/User | 5-50 | Good amount for personalization |
| Similarity Score (Top) | 0.7-0.95 | Relevance of top memory result |
| Firestore Reads/Msg | 1-2 | Efficient database usage |
| Cloud Function Executions | 2/msg | 1 for retrieve, 1 for capture |

---

## Next Steps

Once memory is verified working:

1. **Optimize retrieval limit** - Adjust `RAG_RETRIEVAL_LIMIT` in `.env.local` (default: 5)
2. **Test Zapier integration** - Connect external workflows to memory events
3. **Test Slack integration** - Get notified of key memories via Slack
4. **Monitor token usage** - Track usage with `RAG_MEMORY_RETENTION_DAYS` setting
5. **Customize similarity threshold** - Adjust `RAG_SIMILARITY_THRESHOLD` (default: 0.6)

---

## Support Resources

- [Firebase Console - Firestore Docs](https://firebase.google.com/docs/firestore)
- [Vertex AI Embeddings Guide](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
- [Google Cloud Logging](https://cloud.google.com/logging/docs)
- [Clerk Authentication Docs](https://clerk.com/docs)
