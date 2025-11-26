# Usage Examples: RAG Memory + Zapier/Slack Integration

## User Journeys

### 1. User Signs Up & Uses Genie

```
1. User signs up via Clerk
   → Firestore trigger creates user collections

2. User navigates to /dashboard/conversation
   → App loads RAG-enabled chat interface

3. User types: "How do I build a React component?"
   → Request goes to /api/conversation

4. Next.js API route:
   - Retrieves relevant past memories about React
   - Injects memory context into Gemini prompt
   - Gemini generates personalized response
   - Response returned immediately

5. Async memory capture:
   - Tags extracted: ["react", "components", "javascript"]
   - Summary created from response
   - Embedding generated and stored
   - User context updated (interaction count, tokens)
   - Zapier webhook triggered (if enabled)
   - Slack notification sent (if enabled)

6. Next day, same user asks: "Build a form component"
   → Relevant memory about React injected into prompt
   → AI provides contextualized response referencing previous conversation
```

### 2. Zapier Integration Workflow

**Setup Phase**:
```
1. User visits Genie → Settings → Integrations
2. Clicks "Connect Zapier"
3. Redirected to /api/integrations/zapier/auth
   - State token generated for CSRF protection
   - Redirected to Zapier OAuth
4. User authorizes Genie to access their Zapier account
5. Zapier redirects to /api/integrations/zapier/callback
   - State verified
   - Access token stored in Firestore
   - User confirmed: "Zapier connected!"
```

**Runtime Execution**:
```
Genie User creates memory:
  "How to optimize database queries"

Cloud Function triggers:
  - Analyzes memory content
  - Calls triggerZapierWebhook()

Zapier receives webhook:
  {
    event: "memory.created",
    userId: "user_123",
    data: {
      memoryId: "mem_456",
      featureType: "conversation",
      title: "Database optimization",
      summary: "Discussed query indexing, N+1 problems, caching strategies",
      tags: ["database", "optimization", "sql"]
    }
  }

In Zapier, user has Zap configured:
  Trigger: Genie → Memory Created
  Action: Google Sheets → Create Row

Result: New row added to Google Sheet:
  | Date       | User | Topic             | Summary | Tags |
  |------------|------|-------------------|---------|------|
  | Nov 25, 25 | User | Database optim... | Discuss | db   |
```

**Example Zaps to Create**:

```
Zap 1: Save memories to Airtable
  Trigger: Genie → Memory Created
  Action: Airtable → Create Record
  Fields: Title, Summary, Tags, Date, Feature Type

Zap 2: Alert on high token usage
  Trigger: Genie → Interaction Logged (with tokensUsed > 5000)
  Action: Gmail → Send Email
  Subject: "High token usage alert: {tokensUsed} tokens used"

Zap 3: Create GitHub issues from code memories
  Trigger: Genie → Memory Created (featureType = "code")
  Action: GitHub → Create Issue
  Title: {memory.title}
  Body: {memory.summary}

Zap 4: Export weekly stats to Slack
  Trigger: Schedule → Every Monday at 9am
  Action: Genie → Get User Stats (via API)
  Action: Slack → Post Message
  Channel: #analytics
  Message: "Last week: {totalInteractions} interactions, {tokensUsed} tokens"
```

### 3. Slack Integration Workflow

**Setup Phase**:
```
1. Slack workspace admin:
   - Goes to https://api.slack.com/apps
   - Creates new app: "Genie AI"
   - Enables: Commands, Interactive Components, Events
   - Adds slash command /genie
   - Gets App ID and Client Secret

2. Individual user:
   - Invites @Genie to channel
   - Clicks "Connect to Genie" in app home
   - Redirected to /api/integrations/slack/auth
   - Authorizes Genie to access their Slack
   - Bot installed and ready

3. Firestore updated:
   - integrations.slackEnabled = true
   - integrations.slackChannelId = C1234567
   - integrations.slackUserId = U1234567
   - integrations.slackUserName = john_doe
```

**Commands in Action**:

```
User types in Slack: /genie help

Cloud Function receives request:
  {
    command: "/genie",
    text: "help",
    user_id: "U1234567",
    channel_id: "C1234567",
    response_url: "https://hooks.slack.com/..."
  }

Cloud Function calls handleSlackCommand():
  → Matches "help" action
  → Returns help message with buttons

Slack displays:
  ────────────────────────────────
  Genie AI Slack Commands
  
  /genie help - Show this help message
  /genie memory - View your memory summary
  /genie stats - Get your usage statistics
  /genie notify - Configure notifications
  ────────────────────────────────


User types: /genie stats

Cloud Function retrieves:
  - totalInteractions: 42
  - totalTokensUsed: 125,000
  - Member Since: Nov 1, 2025

Slack displays:
  ────────────────────────────────
  Your Genie Stats
  
  📊 Total Interactions: 42
  🔤 Total Tokens Used: 125,000
  ⏰ Member Since: 11/1/2025
  ────────────────────────────────


User types: /genie memory

Cloud Function retrieves recent memories:
  1. Building React Custom Hooks
  2. Database Query Optimization
  3. Docker Containerization
  (last 5 memories)

Slack displays with buttons:
  ────────────────────────────────
  Your Recent Memories
  
  • Building React Custom Hooks
  • Database Query Optimization
  • Docker Containerization
  
  [View Details] [Export to Google Drive]
  ────────────────────────────────
```

**Automatic Notifications**:

```
When user enables notifications (/genie notify):

Genie saves to Firestore:
  integrations.slackEnabled = true
  integrations.notifyOn = ["memory.created"]

After each conversation, Cloud Function sends:

POST to Slack API:
  channel: "C1234567"
  text: "New memory saved: Building React Custom Hooks"
  blocks: [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Building React Custom Hooks*\nDiscussed useEffect cleanup, useCallback for performance, custom hook patterns\n📌 Feature: conversation"
      }
    }
  ]

Slack channel shows:
  ────────────────────────────────
  🤖 Genie AI
  
  New memory saved: Building React Custom Hooks
  
  Discussed useEffect cleanup, useCallback for 
  performance, custom hook patterns
  
  📌 Feature: conversation
  ────────────────────────────────
```

## API Usage Examples

### Calling Conversation API with RAG

```typescript
// Frontend (React)
const response = await fetch('/api/conversation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      {
        role: 'user',
        text: 'How can I optimize my database queries?'
      }
    ]
  })
});

const { text } = await response.json();
console.log(text);

// Behind the scenes:
// 1. Auth check passes (userId = "user_123")
// 2. Query: "How can I optimize my database queries?"
// 3. RAG retrieves memories about:
//    - Previous database optimization discussion
//    - SQL indexing tips
//    - Query performance patterns
// 4. Memories injected into prompt
// 5. Gemini generates response with context
// 6. Response returned to user
// 7. Async capture stores this interaction
```

### Manually Triggering Memory Capture

```typescript
// Somewhere in your app
import { captureMemory } from '@/lib/ragMemory';

const result = await captureMemory(
  userId,
  'conversation',
  'Optimizing Database Queries',
  'Discussed N+1 problem, indexing strategies, query caching, denormalization',
  [
    { role: 'user', content: 'How to optimize queries?' },
    { role: 'assistant', content: 'Here are best practices...' }
  ],
  tokensUsed = 1500,
  tags = ['database', 'optimization', 'sql'],
  metadata = { source: 'support-ticket', context: '123' }
);

console.log(result); 
// { success: true, memoryId: 'mem_456' }
```

### Retrieving Specific Memories

```typescript
// Cloud Function code (for advanced use)
import { retrieveRelevantMemories } from './ragMemoryService';

const memories = await retrieveRelevantMemories(
  userId = 'user_123',
  query = 'database performance',
  featureType = 'conversation',
  limit = 3
);

// Returns:
[
  {
    id: 'mem_001',
    title: 'Database Indexing',
    summary: 'Discussed B-tree indexes, query planning, index types',
    similarity: 0.92,
    featureType: 'conversation',
    tags: ['database', 'indexes']
  },
  // ... more results sorted by relevance
]
```

## Error Handling Examples

### Memory Capture Failure (Non-Blocking)

```typescript
// In /api/conversation/route.ts

try {
  // Generate response
  const responseText = await chat.sendMessage(prompt);
  
  // Capture memory (async, non-blocking)
  captureMemory(...).catch(err => {
    console.error('Memory capture failed:', err);
    // Don't throw - user gets response anyway
  });
  
  return NextResponse.json({ text: responseText });
} catch (error) {
  // Only throw on critical errors (no response generated)
  return NextResponse.json({ error: error.message }, { status: 500 });
}
```

### Zapier Webhook Failure

```typescript
// In Cloud Function
try {
  await axios.post(zapierWebhookUrl, payload);
  console.log('Webhook sent successfully');
} catch (error) {
  console.error('Zapier webhook failed:', error);
  // Log for retry mechanism
  // But don't block memory storage
}
```

### Slack Notification Failure

```typescript
// In sendSlackNotification()
try {
  await axios.post(slackApiUrl, payload, {
    headers: { Authorization: `Bearer ${botToken}` }
  });
} catch (error) {
  console.error('Slack notification failed:', error);
  // Fail silently - user still gets AI response
  // Log for debugging
}
```

## Monitoring & Debugging

### Check Memory Retrieval Working

```bash
# 1. Create a conversation in Genie
# Type something and get a response

# 2. Check Firestore:
# - Go to Firebase Console
# - users/{userId}/memories/
# - Should see new document with embedding

# 3. Check Cloud Function logs:
firebase functions:log

# Should see:
# generateEmbedding: Creating vector for "your query"
# storeUserMemory: Stored memory with ID mem_456
# Memory {memoryId} updated for user {userId}
```

### Test Zapier Integration

```bash
# Manually trigger webhook
curl -X POST https://your-zapier-webhook-url \
  -H "Content-Type: application/json" \
  -H "X-Zapier-Signature: $(generateSignature)" \
  -d '{
    "event": "memory.created",
    "userId": "user_123",
    "data": {
      "memoryId": "mem_789",
      "title": "Test Memory",
      "summary": "This is a test",
      "tags": ["test"]
    }
  }'

# Should see in Zapier:
# - Incoming webhook received
# - Task appears in task queue
# - Action executes (e.g., create sheet row)
```

### Test Slack Commands

```bash
# In any Slack channel with Genie installed:
/genie stats

# Should see response with usage stats
# Check logs: firebase functions:log handleSlackCommand
```

---

**These examples show typical user flows and troubleshooting steps.**
