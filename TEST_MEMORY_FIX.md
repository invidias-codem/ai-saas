# Testing the Memory Fix - Step by Step

## Problem We Fixed

**Before:** Genie knew your name but forgot your profession  
**After:** Genie should now remember both your name AND profession

## What Changed

We implemented **hybrid memory retrieval**:
1. **Keyword matching** - Direct text search (now enabled as fallback)
2. **Lower threshold** - Changed from 0.6 to 0.3
3. **Better logging** - Debug visibility into what's happening

---

## Test Procedure

### Step 1: Clear Your Browser Cache (Optional but Recommended)
1. Open DevTools (F12)
2. Right-click refresh button → Empty cache and hard refresh

### Step 2: Test Conversation Sequence

**Message 1:** Tell Genie about your profession
```
"I'm a software developer working in IT"
```

**Expected:** Generic greeting, basic acknowledgment

**Message 2:** Ask if it remembers
```
"Do you remember what I do?"
```

**Expected:** ✅ Genie mentions software development or IT
- ❌ If it doesn't remember, something's still wrong

**Message 3:** More context
```
"My specialty is backend systems"
```

**Expected:** Generic response

**Message 4:** Test memory retention
```
"What was my specialty again?"
```

**Expected:** ✅ Genie mentions backend systems
- If successful, memory is working!

---

## Checking Behind the Scenes

### Method 1: Browser DevTools Network Tab

1. Open DevTools (F12) → **Network** tab
2. Filter by "Fetch/XHR"
3. Send a message
4. Look for requests:
   - `POST /api/conversation` → Check response
   - `POST /captureConversationMemory` → Should succeed
   - `POST /retrieveMemories` → Should return memories

**What you should see:**
```javascript
// Response from /api/conversation
{
  "text": "Your response from Genie..."
}

// Check console for logs like:
"[CONVERSATION] User: Joshua Mohammed (user_2...) | Query: Do you remember what I do?..."
```

### Method 2: Check Cloud Function Logs

```bash
firebase functions:log --only captureConversationMemory -n 50
```

Look for:
- `[storeUserMemory] Memory stored successfully`
- `[CONVERSATION] User: Joshua Mohammed...`

```bash
firebase functions:log --only retrieveMemories -n 50
```

Look for:
- `Memory: "User Profession" | Similarity: 0.6+ | Method: keyword`
- `Memories passing threshold: 1`

### Method 3: Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select **genie-ai-1ca85** project
3. Go to **Firestore Database**
4. Click **users** collection
5. Click your user ID
6. Look for **memories** collection
7. Each memory should show:
   - `title`: "Do you remember what I do?"
   - `summary`: Generated AI summary
   - `tags`: Extracted keywords
   - `metadata`: Additional info
   - `embedding`: [] (may be empty - that's OK!)

---

## Troubleshooting

### Issue: Still not remembering profession

**Check 1:** Are memories being captured?
```bash
firebase functions:log --only captureConversationMemory -n 20 | grep -i "stored successfully"
```

If not appearing:
- Restart dev server: `npm run dev`
- Check `.env.local` has `NEXT_PUBLIC_RAG_ENABLED=true`

**Check 2:** Are memories being retrieved?
```bash
firebase functions:log --only retrieveMemories -n 20 | grep "Memories passing threshold"
```

Should show: `Memories passing threshold: 1` or more

If showing `0`:
- Check `.env.local`: `RAG_SIMILARITY_THRESHOLD=0.3`
- May need lower threshold

**Check 3:** Are keywords matching?
```bash
firebase functions:log --only retrieveMemories -n 50 | grep "Method: keyword"
```

Should show: `Method: keyword` (indicating fallback is working)

### Issue: Embeddings still empty

This is expected and OK! The fallback keyword matching handles it:
- ✅ Embeddings empty but memory retrieved: Keyword matching worked
- ✅ Similarity shown (e.g., 0.6): Keyword match scored 0.6
- This is functioning correctly

### Issue: Memory captured but not retrieved

**Cause:** Similarity threshold too high or keyword not matching

**Fix:** Lower threshold further
```bash
# In .env.local
RAG_SIMILARITY_THRESHOLD=0.2  # Even lower
```

Then restart dev server and test again.

---

## Success Indicators

✅ **All of these should be true:**

1. **Logs show capture:**
   ```
   [storeUserMemory] Memory stored successfully
   ```

2. **Logs show retrieval:**
   ```
   [retrieveRelevantMemories] Memories passing threshold: 1
   ```

3. **Genie references profession in second+ message**

4. **Browser DevTools shows 200 responses** for all API calls

5. **Firestore shows memory documents** with your profession

6. **Console shows debug logs:**
   ```
   Memory: "User Profession" | Method: keyword | Similarity: 0.6
   ```

---

## Performance Expectations

| Operation | Time | Method |
|-----------|------|--------|
| Memory capture | 100-500ms | Cloud Function |
| Memory retrieval | 50-200ms | Keyword matching (fastest) |
| Prompt injection | 10-50ms | Local formatting |
| **Total per message** | **2-5 seconds** | Including Gemini response |

---

## Advanced Debugging

### View all memories for your user

```bash
# Get your user ID first from browser console:
clerk?.user?.id

# Then use memory inspector:
npx ts-node memory-inspector.ts user_2fKrhBUyKuYP1w3SD2aYjOImqqi
```

This will show:
- All stored memories
- Embedding dimensions
- Tags extracted
- Similarity stats
- Storage size

### Manual memory test

```bash
./test-memory-fix.sh
```

This runs an automated test that:
1. Captures a profession memory
2. Retrieves it with similar query
3. Verifies keyword matching works
4. Shows similarity scores

---

## Next Steps

### If working:
- ✅ All memory features enabled!
- ✅ Test Zapier integration (trigger on memory capture)
- ✅ Test Slack integration (get memory notifications)
- ✅ Monitor memory growth over time

### If not working:
1. Check logs: `firebase functions:log --only retrieveMemories -n 50`
2. Lower threshold: `RAG_SIMILARITY_THRESHOLD=0.1`
3. Verify `.env.local` variables
4. Restart: `npm run dev`
5. Test again with fresh conversation

---

## Questions to Ask Genie to Test

**Test Name Retention:**
- "What's my name?"
- "Tell me about myself"

**Test Profession Retention:**
- "What do I do for work?"
- "What's my job?"
- "Remind me what I told you about my career"

**Test Combined Context:**
- "Who am I?"
- "Tell me what you know about me"

**Test Cross-Turn Memory:**
- Send: "I work in IT and specialize in cloud"
- Send: "What's my specialty?" → Should remember "cloud"
- Send: "What's my main field?" → Should remember "IT"

---

## Key Files Modified

1. **functions/src/ragMemoryService.ts** - Enhanced embedding & retrieval
2. **.env.local** - Lowered similarity threshold
3. **app/api/conversation/route.ts** - Better logging
4. **lib/ragMemory.ts** - User context gathering

All changes deployed to Cloud Functions.

---

**Expected Result:** Genie now remembers your profession! 🧞‍♂️

Test it and let me know what you see in the logs.
