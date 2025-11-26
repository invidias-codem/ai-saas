# 🧠 Memory Persistence Testing & Debugging Guide

## Quick Start

Memory persistence is now fully implemented with **direct Firestore retrieval** as a fallback mechanism. Here's how to verify it's working:

---

## Test 1: Verify Facts Are Being Stored

### Step 1: Open Genie in Development
```bash
# Ensure dev server is running
npm run dev
# Server should be at http://localhost:3000
```

### Step 2: Start a Conversation
1. Go to `http://localhost:3000/conversation`
2. **Say something memorable:**
   ```
   I'm working on a project called "CloudSync" using Node.js and PostgreSQL.
   I've decided to use JWT for authentication.
   ```
3. Wait for Genie to respond

### Step 3: Check Settings Page
1. Navigate to `http://localhost:3000/settings`
2. You should see a "Your Memory Bank" section
3. Look for facts like:
   - "CloudSync" (project)
   - "Node.js and PostgreSQL" (tech stack)
   - "JWT for authentication" (decision)

**✓ If facts appear**: Extraction and storage working! ✅

---

## Test 2: Verify Memory Retrieval in New Conversation

### Step 1: Start New Conversation
1. Click "New Conversation" or refresh
2. This creates a new conversation session
3. **Ask Genie:**
   ```
   What project am I working on?
   ```

### Step 2: Observe Memory Injection
1. **Check browser console** (F12):
   - Look for logs: `[Memory Persistence] Retrieved X facts for user...`
   - Shows sample facts being injected

2. **Expected response:**
   Genie should mention "CloudSync" and "Node.js/PostgreSQL" from previous conversation

**✓ If Genie remembers**: Memory persistence working! ✅

---

## Test 3: Check Server Logs

### View Memory Injection Logs
```bash
# Terminal where npm run dev is running, look for:
[Memory Persistence] Retrieved 3 facts for user abc123xyz
[Memory Persistence] Sample facts: [
  { type: 'project', content: 'CloudSync project with Node.js...' },
  { type: 'decision', content: 'JWT for authentication...' }
]
```

### Debug Fact Retrieval
If no facts appear, logs will show:
```
[Memory Persistence] Retrieved 0 facts for user abc123xyz
```

This means facts aren't being retrieved. Check:
1. Are facts actually stored in Firestore?
2. Are they expiring too quickly?
3. Is the Firebase connection working?

---

## Test 4: Direct Firestore Check

### Method 1: Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select "ai-saas" project
3. Navigate to Firestore → Collections
4. Look for: `users` → `[your-user-id]` → `facts`
5. You should see documents with:
   - `type`: "project", "decision", etc.
   - `content`: The extracted fact
   - `confidence`: 0.75 - 1.0
   - `expiresAt`: Future timestamp (90 days)

**✓ If facts visible**: Storage working! ✅

### Method 2: Using Test Script
```bash
# Make the test script executable
chmod +x test-memory-flow.sh

# Run memory flow test
./test-memory-flow.sh
```

---

## Architecture: How Memory Persists

```
┌─────────────────────────────────────┐
│ Conversation 1: User mentions project │
│ "Building CloudSync with Node.js"     │
└────────────┬────────────────────────┘
             ↓
    📤 captureMemory() sends to Cloud Function
             ↓
    🔍 Cloud Function extracts facts:
       - Project: CloudSync
       - Tech: Node.js
             ↓
    💾 Stores in Firestore:
       users/{userId}/facts/{factId}
             ↓
       Facts stored with 90-day TTL
             ↓
┌─────────────────────────────────────┐
│ Conversation 2: New session starts    │
│ User: "What am I building?"          │
└────────────┬────────────────────────┘
             ↓
    🔄 getHighConfidenceFacts() called
             ↓
    Query Firestore directly:
    users/{userId}/facts
       ├─ Non-expired facts ✓
       ├─ Confidence ≥ 0.75 ✓
       └─ Most recent first ✓
             ↓
    📥 Injects into prompt:
    "Critical Context (Verified Facts):
     Projects: CloudSync
     Tech: Node.js"
             ↓
    🤖 Gemini responds with memory
       "You're building CloudSync
        with Node.js!"
```

---

## Troubleshooting

### Problem: No facts appear in settings
**Solution:**
1. Verify user is logged in (Clerk auth)
2. Check Firebase rules allow read/write
3. Try a new conversation with clear mentions
4. Check server logs for extraction errors

### Problem: Facts appear in settings but not in conversation
**Solution:**
1. Check browser console logs (F12)
2. Look for: `[Memory Persistence] Retrieved X facts...`
3. If 0 facts: Firestore query may be failing
4. Try clearing browser cache and retrying

### Problem: Facts expire too quickly
**Solution:**
- Conversation facts should have 90-day TTL
- Check Firestore: document should have `expiresAt` field
- If missing expiration: Facts are user-level (permanent)
- Check console logs for cleanup

### Problem: Same fact appears multiple times
**Solution:**
- Deduplication merges similar facts
- Check Firestore for multiple docs with similar content
- System should merge on next conversation

---

## Key Implementation Details

### Two-Tier Retrieval Strategy

**Tier 1: Cloud Function** (if configured)
```
getHighConfidenceFacts()
  ↓
Calls: RAG_CLOUD_FUNCTION_URL/retrieveFacts
  ↓
Returns facts or falls through if timeout
```

**Tier 2: Direct Firestore** (fallback)
```
getHighConfidenceFactsDirectly()
  ↓
Queries: users/{userId}/facts
  ↓
Filters: confidence ≥ 0.75, not expired
  ↓
Returns: Up to 10 facts ordered by confidence
```

### Why Two Methods?

1. **Cloud Function** (if deployed):
   - Centralized processing
   - Can do complex logic
   - Better for scaling

2. **Direct Firestore** (fallback):
   - Simple and reliable
   - Always works if Firebase auth OK
   - No external dependencies
   - Fast retrieval

---

## Verification Checklist

- [ ] Conversation route includes `getHighConfidenceFacts()` call
- [ ] Facts stored at `users/{userId}/facts` in Firestore
- [ ] Each fact has: type, content, confidence, scope, expiresAt
- [ ] Conversation-level facts have expiresAt set to +90 days
- [ ] User-level facts have NO expiresAt (permanent)
- [ ] Settings page shows facts with expiration dates
- [ ] Delete button removes facts from Firestore
- [ ] Extend button updates expiresAt to +90 days
- [ ] New conversation retrieves old facts
- [ ] Gemini prompt includes facts (check console logs)
- [ ] Memory survives after browser refresh
- [ ] Memory survives after dev server restart

---

## Debug Logging

### Enable Enhanced Logging

In `app/api/conversation/route.ts`, facts retrieval already logs:
```typescript
console.log(`[Memory Persistence] Retrieved ${facts.length} facts for user ${userId}`);
if (facts.length > 0) {
  console.log('[Memory Persistence] Sample facts:', facts.slice(0, 2).map(f => ({ 
    type: f.type, 
    content: f.content.substring(0, 50) 
  })));
}
```

### Monitor Server Logs

Watch the `npm run dev` terminal for:
```
[Memory Persistence] Retrieved 3 facts for user user_123
[Memory Persistence] Sample facts: [
  { type: 'project', content: 'CloudSync - Node.js and PostgreSQL da...' },
  { type: 'decision', content: 'Using JWT for authentication instead...' }
]
```

---

## Next Steps

After verifying memory persistence is working:

1. **Monitor in production**:
   - Deploy Cloud Functions: `firebase deploy --only functions`
   - Deploy app: `vercel deploy`
   - Test in production environment

2. **Optimize**:
   - Monitor query performance
   - Adjust fact limit (currently 10)
   - Tune TTL policies if needed

3. **Enhance**:
   - Add search functionality
   - Export/backup memories
   - Memory analytics dashboard

---

## Support

If memory isn't persisting:

1. **Check Firestore data exists**:
   - Firebase Console → Firestore → Users collection
   - Look for documents at: `users/{userId}/facts`

2. **Check console logs**:
   - Browser: F12 → Console tab
   - Server: `npm run dev` terminal

3. **Verify authentication**:
   - Are you logged in with Clerk?
   - Check user ID matches in Firestore

4. **Reset if needed**:
   - Delete test facts in Firebase Console
   - Start fresh conversation
   - Check if new facts are created

---

**Status**: ✅ Memory persistence fully implemented and ready for testing!
