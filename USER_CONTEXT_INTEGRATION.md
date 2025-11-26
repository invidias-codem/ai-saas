# User Context & Memory Bank Integration Guide

## Overview

The Genie AI platform now includes comprehensive **logged-in user detection** and **user context gathering** integrated with the memory bank. This enables:

- ✅ Automatic Clerk user detection
- ✅ Full user profile context injection
- ✅ Memory statistics and interaction patterns
- ✅ Personalized conversation history
- ✅ Topic and feature preferences tracking

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User sends message to /api/conversation                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Clerk Authentication: Extract userId                     │
├─────────────────────────────────────────────────────────────┤
│ 2. Fetch Clerk User: Get profile (name, email, avatar)      │
├─────────────────────────────────────────────────────────────┤
│ 3. Gather User Context: Call getMemoryStats Cloud Function  │
│    ✓ Total conversations                                    │
│    ✓ Total tokens used                                      │
│    ✓ Preferred features                                     │
│    ✓ Common topics/tags                                     │
│    ✓ Interaction style                                      │
├─────────────────────────────────────────────────────────────┤
│ 4. Format User Context: "## About This User" section        │
├─────────────────────────────────────────────────────────────┤
│ 5. Retrieve Past Memories: Semantic search via embeddings   │
├─────────────────────────────────────────────────────────────┤
│ 6. Inject Both into Gemini Prompt                           │
│    User Context + Memory Context + Current Query            │
├─────────────────────────────────────────────────────────────┤
│ 7. Generate Personalized Response                           │
├─────────────────────────────────────────────────────────────┤
│ 8. Capture Interaction: Store in memory bank (async)        │
│    ✓ User metadata (name, email)                           │
│    ✓ Token count for statistics                             │
│    ✓ Interaction style                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Conversation API Enhancement

**File**: `/app/api/conversation/route.ts`

The conversation API now:

```typescript
// Get authenticated user from Clerk
const { userId } = auth();
const clerkUser = await currentUser();

// Gather comprehensive user context
const userContext = await gatherUserContext(userId, clerkUser);
const userContextPrompt = formatUserContextForPrompt(userContext);

// Inject into Gemini prompt before memory context
const enhancedPromptText = userContextPrompt + memoryContext + userQuery;
```

**Key Changes**:
- Imports `currentUser` from `@clerk/nextjs/server`
- Calls `gatherUserContext()` utility function
- Formats user context for prompt injection
- Stores metadata (name, email, interaction style) with memories

### 2. User Context Gathering Utilities

**File**: `/lib/ragMemory.ts`

New exported functions:

#### `gatherUserContext(userId, clerkUser)`
Collects comprehensive user profile and memory statistics:

```typescript
export interface UserContextData {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  profileImageUrl?: string;
  clerkMetadata?: Record<string, any>;
  conversationCount: number;        // Total memories
  totalTokensUsed: number;          // Cumulative tokens
  lastConversationDate?: Date;      // Most recent interaction
  preferredFeatures: string[];      // Top 3-5 features used
  commonTopics: string[];           // Top 4-6 tags/topics
  interactionStyle?: string;        // 'technical' | 'creative' | 'analytical' | 'general'
}
```

#### `getMemoryStatistics(userId)`
Queries Cloud Function to fetch memory stats:

```typescript
// Returns:
{
  totalMemories: 25,
  totalTokensUsed: 5840,
  lastInteractionDate: "2025-11-25T...",
  topFeatures: ["conversation", "code", "image"],
  topTags: ["python", "api", "react", "data-science", ...]
}
```

#### `formatUserContextForPrompt(userContext)`
Formats stats into Gemini prompt section:

```
## About This User
User: Sarah Chen
Conversation History: 25 previous interactions
Last conversation: Today
Favorite Features: conversation, code, image
Common Topics: python, api, react, data-science, ml
Interaction Style: analytical
```

### 3. Memory Statistics Cloud Function

**File**: `/functions/src/conversationCapture.ts`

New HTTP Cloud Function `getMemoryStats`:

```typescript
export const getMemoryStats = functions.https.onRequest(...)
```

**What it does**:
- Fetches all memories for a user
- Calculates statistics:
  - Total memory count
  - Total tokens (from metadata)
  - Most recent interaction date
  - Feature type frequency
  - Tag frequency analysis
- Returns sorted top features and tags

**Usage**:
```bash
curl -X POST https://.../getMemoryStats \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_2abc123def"}'

# Response:
{
  "success": true,
  "totalMemories": 25,
  "totalTokensUsed": 5840,
  "lastInteractionDate": "2025-11-25T14:32:10Z",
  "topFeatures": ["conversation", "code"],
  "topTags": ["python", "api", "react", ...]
}
```

### 4. Enhanced Memory Capture

**File**: `/functions/src/conversationCapture.ts`

Memory now stored with user metadata in `metadata` field:

```typescript
metadata: {
  userName: "Sarah Chen",           // From Clerk
  userEmail: "sarah@example.com",   // From Clerk
  responseLength: 342,
  interactionStyle: "analytical",   // Detected from patterns
  tokensUsed: 245                   // For statistics
}
```

---

## How It Works in Practice

### Example User Flow

**User: Sarah Chen logs in (Clerk ID: `user_2abc123`)**

1. **First Message**: *"My name is Sarah and I'm learning Python"*
   - Clerk extracts: name="Sarah", email="sarah@example.com"
   - No previous memories (new user)
   - Gemini responds with generic greeting
   - Memory stored with metadata

2. **Second Message**: *"What should I focus on?"*
   - Clerk user still: Sarah Chen
   - User context gathered:
     - Total memories: 1
     - Last interaction: 2 minutes ago
     - Common topics: ["introduction", "python"]
   - Gemini prompt includes:
     ```
     ## About This User
     User: Sarah Chen
     Conversation History: 1 previous interaction
     Last conversation: 2 minutes ago
     Common Topics: introduction, python
     ```
   - Gemini responds: "Based on your Python learning interest, I'd recommend..."

3. **Third Message**: *"Show me a decorator example"*
   - Previous memories injected:
     ```
     ## User's Relevant Previous Work
     **Previous Interaction** (conversation):
     Title: Python Learning
     Summary: User interested in Python programming
     Tags: introduction, python
     ```
   - Combined with user context
   - Personalized response provided

---

## Data Flow Diagram

```
┌─────────────────────┐
│  Logged-in User     │
│  (Clerk Auth)       │
└──────────┬──────────┘
           │ userId + profile
           ▼
┌─────────────────────────────────┐
│ getRAGMemoryContext()           │
│ ✓ Semantic search               │
│ ✓ Return top 5 memories         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ gatherUserContext()             │
│ ✓ Call getMemoryStats Cloud Fn  │
│ ✓ Fetch Clerk profile data      │
│ ✓ Calculate interaction style    │
└────────────┬────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ formatUserContextForPrompt()                 │
│ + formatMemoriesForPrompt()                  │
│ ✓ Create "About This User" section          │
│ ✓ Create "Previous Work" section             │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ Gemini Prompt                                │
│ [System Instruction]                        │
│ [Greeting]                                  │
│ [Chat History]                              │
│ [About This User] ← NEW                    │
│ [Previous Work]                             │
│ [Current Query]                             │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ Personalized Response from Gemini           │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ Async Memory Capture (non-blocking)         │
│ ✓ Store conversation + metadata             │
│ ✓ Extract tags                              │
│ ✓ Generate embedding                        │
│ ✓ Save to Firestore                         │
│ ✓ Trigger integrations (Zapier, Slack)     │
└──────────────────────────────────────────────┘
```

---

## Personalization Examples

### Based on User Context

**User Profile**: `totalMemories: 50, topFeatures: ["code", "conversation"], commonTopics: ["Python", "React", "API"]`

**System Injection**:
```
## About This User
User: Alex Johnson
Conversation History: 50 previous interactions
Last conversation: Yesterday
Favorite Features: code, conversation
Common Topics: Python, React, API
Interaction Style: technical
```

**Gemini Behavior Change**:
- ✅ More technical explanations
- ✅ Assumes Python/React knowledge
- ✅ Provides code examples by default
- ✅ References previous projects
- ✅ Uses professional terminology

### Based on Memory Context

**Previous Memories Retrieved**:
- "Python async/await tutorial"
- "React hooks custom implementation"
- "RESTful API design patterns"

**Gemini Behavior**:
- ✅ Builds on previous explanations
- ✅ References similar concepts
- ✅ Avoids repeating previous content
- ✅ Suggests advanced topics
- ✅ Maintains conversation continuity

---

## Environment Configuration

Ensure `.env.local` has:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# RAG Memory System
NEXT_PUBLIC_RAG_ENABLED=true
RAG_CLOUD_FUNCTION_URL=https://us-central1-genie-ai-1ca85.cloudfunctions.net
RAG_RETRIEVAL_LIMIT=5

# Google AI Services
GOOGLE_API_KEY=AIzaSy...
GOOGLE_PROJECT_ID=genie-ai-1ca85
```

---

## Testing the Integration

### Test 1: Verify Clerk User Detection
```bash
# Open browser DevTools Console and paste:
clerk?.user?.id
clerk?.user?.fullName
clerk?.user?.primaryEmailAddress?.emailAddress
```

### Test 2: Check Memory Statistics
```bash
curl -X POST https://us-central1-genie-ai-1ca85.cloudfunctions.net/getMemoryStats \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_2abc123def"}'
```

### Test 3: Send Test Message with User Context
1. Log in to Genie AI as authenticated user
2. Go to Conversation feature
3. Send: *"Who am I? What have I been working on?"*
4. Gemini should reference:
   - Your name
   - Your conversation count
   - Your favorite features
   - Your common topics

### Test 4: Check Stored Metadata
1. Go to Firebase Console
2. Navigate to Firestore
3. View `users/{userId}/memories` collection
4. Inspect latest memory document
5. Check `metadata` field has:
   - `userName`
   - `userEmail`
   - `tokensUsed`
   - `interactionStyle`

---

## Performance Considerations

| Operation | Time | Blocking |
|-----------|------|----------|
| Clerk user fetch | 50-150ms | Yes (required) |
| Memory stats retrieval | 200-500ms | Yes (user context) |
| Memory semantic search | 300-800ms | Yes (context quality) |
| Memory capture | 500-2000ms | No (async) |
| Gemini response | 1-3s | Yes (main output) |

**Total API Response Time**: ~2-4 seconds (with all operations)

---

## Troubleshooting

### Issue: User context shows "general" style
**Cause**: Not enough interaction history
**Solution**: Send more messages to build interaction patterns

### Issue: Memory stats returning 0 memories
**Cause**: No memories captured yet
**Solution**: Normal for new users; will populate after first interaction

### Issue: "About This User" section not appearing
**Cause**: User context formatting failed
**Solution**: Check `.env.local` for RAG configuration

### Issue: Personalization not working
**Cause**: User context not injected properly
**Solution**: Check conversation API logs for context gathering errors

---

## API Reference

### `gatherUserContext(userId, clerkUser)`
**Returns**: `Promise<UserContextData>`

```typescript
const context = await gatherUserContext(userId, clerkUser);
console.log(context.fullName);        // "Sarah Chen"
console.log(context.conversationCount); // 25
console.log(context.preferredFeatures); // ["code", "conversation"]
```

### `getMemoryStatistics(userId)`
**Returns**: Promise with stats object

```typescript
const stats = await getMemoryStatistics(userId);
console.log(stats.totalMemories);     // 25
console.log(stats.topTags);           // ["python", "api", ...]
```

### `formatUserContextForPrompt(userContext)`
**Returns**: Formatted string for prompt injection

```typescript
const prompt = formatUserContextForPrompt(context);
// Returns: "\n## About This User\nUser: Sarah Chen\n..."
```

---

## Next Steps

1. ✅ Deploy conversation API with Clerk detection
2. ✅ Deploy getMemoryStats Cloud Function
3. ✅ Test with real logged-in users
4. ✅ Monitor personalization quality
5. ✅ Adjust RAG_RETRIEVAL_LIMIT if needed
6. ⏳ Add cross-feature memory (code → conversation)
7. ⏳ Implement memory-based recommendations
8. ⏳ Create user memory dashboard/insights

---

**Status**: ✅ Production Ready  
**Last Updated**: November 25, 2025  
**Integration**: Clerk + Firebase + Vertex AI + Gemini
