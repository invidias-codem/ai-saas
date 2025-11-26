# Memory Verification - Quick Start

## ⚡ 30-Second Test

1. **Send a test message:** *"My name is Jamie and I love Python"*
2. **Wait 2 seconds** (let memory capture complete)
3. **Send follow-up:** *"What should I learn next?"*
4. **Expected result:** AI mentions Python or your name

✅ If AI references your name or Python → **Memory works!**
❌ If AI responds generically → **Check diagnostics below**

---

## 🔍 5-Minute Verification

### Step 1: Check Your User ID
```javascript
// Open browser DevTools Console (F12) and paste:
clerk?.user?.id
// Copy the result (looks like: user_2abc123def)
```

### Step 2: View Memories in Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select **genie-ai-1ca85** project
3. Go to **Firestore Database**
4. Click **users** collection
5. Click your **user ID**
6. Look for **memories** collection inside
7. You should see documents after sending messages

### Step 3: Check Network Requests
1. Open DevTools (F12) → **Network** tab
2. Send a message in Genie
3. Look for requests:
   - ✅ POST `/api/conversation` → Response 200
   - ✅ POST `/captureConversationMemory` → Response 200
4. Both should appear within 2 seconds

---

## 🛠️ Diagnostic Tools

### Run the Test Script
```bash
chmod +x test-memory.sh
./test-memory.sh
```
This tests the entire memory pipeline end-to-end.

### Inspect Memory Directly
```bash
npx ts-node memory-inspector.ts user_2abc123def
```
Replace `user_2abc123def` with your actual user ID.

---

## ✅ What Success Looks Like

| Aspect | Expected Behavior |
|--------|-------------------|
| **First Message** | Generic greeting |
| **Second Message** | Mentions your name or previous topic |
| **Third+ Messages** | Increasingly personalized context |
| **Firestore** | New memory document after each message |
| **Network Tab** | Two POST requests per message |
| **Response Time** | Main request <2s, capture async |

---

## ❌ Troubleshooting

### Problem: "No memories found"
- **Cause:** First-time user (expected)
- **Solution:** Send 2-3 messages, then check again

### Problem: 404 on `/captureConversationMemory`
- **Cause:** Functions not deployed
- **Solution:** 
  ```bash
  firebase deploy --only functions
  ```

### Problem: AI not referencing previous messages
- **Cause:** Memory retrieval disabled or not working
- **Solution:**
  1. Check `.env.local`: `NEXT_PUBLIC_RAG_ENABLED=true`
  2. Check Cloud Function logs for errors
  3. Verify user has memories in Firestore

### Problem: "Firestore write failed" in logs
- **Cause:** Database permissions issue
- **Solution:** Check Firestore security rules allow user writes

---

## 📊 Environment Check

```bash
# Verify all required env vars are set
grep -E "RAG_|GOOGLE_|CLERK_" .env.local

# Should show:
# NEXT_PUBLIC_RAG_ENABLED=true
# RAG_CLOUD_FUNCTION_URL=https://...
# GOOGLE_API_KEY=AIzaSy...
# CLERK_SECRET_KEY=sk_test_...
```

---

## 🔗 Memory System Architecture

```
User Message
    ↓
/api/conversation (Clerk auth)
    ↓
getRAGMemoryContext() → retrieves past memories
    ↓
Inject into Gemini prompt
    ↓
Generate response
    ↓
captureMemory() → stores interaction
    ↓
✓ Response sent to user (non-blocking capture)
```

---

## 📱 Test Messages

Try these conversation patterns:

### Pattern 1: Introduction
1. *"Hi! I'm Alex, a data scientist learning Python"*
2. *"What should I focus on?"*
   - Should mention Python or data science

### Pattern 2: Context Building
1. *"I'm working on a machine learning project"*
2. *"Can you help me with feature engineering?"*
   - Should reference the ML project

### Pattern 3: Cross-Feature (if enabled)
1. In **Code**: *"Generate a Python ML example"*
2. In **Conversation**: *"Tell me more about that code"*
   - Should remember the code from step 1

---

## 💡 Pro Tips

1. **Check logs in real-time:**
   ```bash
   firebase functions:log -f captureConversationMemory --tail
   ```

2. **Test with curl:**
   ```bash
   curl -X POST https://us-central1-genie-ai-1ca85.cloudfunctions.net/retrieveMemories \
     -H "Content-Type: application/json" \
     -d '{"userId":"user_123","query":"test"}'
   ```

3. **Export memories (manual):**
   - Firebase Console → Firestore → Export Collection
   - Backup your memory data

4. **Monitor storage costs:**
   - Firebase Console → Firestore → Storage metrics
   - Set retention: `RAG_MEMORY_RETENTION_DAYS=90`

---

## 🚀 Next Steps

Once verified:
1. ✅ Adjust `RAG_RETRIEVAL_LIMIT` (default 5) for more/less context
2. ✅ Fine-tune `RAG_SIMILARITY_THRESHOLD` (default 0.6) for accuracy
3. ✅ Monitor token usage with `estimateTokenCount`
4. ✅ Test Zapier/Slack integrations
5. ✅ Enable cross-feature memory retrieval

---

## 📞 Support

- **Memory retrieval not working?** → Check `RAG_CLOUD_FUNCTION_URL` in `.env.local`
- **Firestore queries failing?** → Verify Firebase credentials in `keys/`
- **Embedding generation slow?** → Check Vertex AI quota in GCP console
- **Memory not persisting?** → Check Firestore Database has `users/{userId}/memories` collection

---

**Last Updated:** November 25, 2025  
**System Status:** ✅ Production Ready  
**Memory Capacity:** 90 days per user (configurable)
