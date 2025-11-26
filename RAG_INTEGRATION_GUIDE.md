# Genie AI - RAG Memory & Integration Architecture

## Overview

This document describes the Retrieval-Augmented Generation (RAG) memory system, Firebase Cloud Functions setup, and integrations with Zapier and Slack for the Genie AI SaaS platform.

## Architecture Components

### 1. RAG Memory System

**Purpose**: Store and retrieve user interactions to provide contextual AI responses

**Flow**:
```
User Request
    ↓
Retrieve relevant memories (Firestore + Semantic Search)
    ↓
Inject memories into Gemini prompt
    ↓
Generate enhanced response
    ↓
Capture interaction (async)
    ↓
Store in Firestore + Generate embedding
    ↓
Trigger integrations (Zapier/Slack)
```

### 2. Data Models

#### UserMemory Collection
```typescript
{
  id: string;
  userId: string;
  featureType: "conversation" | "code" | "image" | "music" | "video";
  title: string;
  summary: string;
  messages: Message[];
  embedding: number[]; // Vertex AI text embedding
  tags: string[]; // Auto-extracted keywords
  createdAt: number;
  updatedAt: number;
  metadata?: any;
}
```

#### UserContext Collection
```typescript
{
  userId: string;
  totalInteractions: number;
  totalTokensUsed: number;
  preferredFeatures: string[];
  communicationStyle?: string;
  recentTopics: string[];
  integrations: {
    zapierEnabled: boolean;
    slackEnabled: boolean;
  };
}
```

#### InteractionEvent Collection
```typescript
{
  id: string;
  userId: string;
  featureType: string;
  action: "create" | "retrieve" | "search" | "share";
  inputLength: number;
  outputLength: number;
  tokensUsed: number;
  duration: number;
  success: boolean;
}
```

### 3. File Structure

```
app/
├── api/
│   ├── conversation/route.ts ✅ Enhanced with RAG retrieval
│   ├── code/route.ts (update similarly)
│   └── integrations/
│       ├── zapier/
│       │   ├── auth/route.ts
│       │   ├── callback/route.ts
│       │   └── webhooks/route.ts
│       └── slack/
│           ├── auth/route.ts
│           ├── callback/route.ts
│           └── webhooks/route.ts

functions/
├── src/
│   ├── index.ts (exports all functions)
│   ├── ragMemoryService.ts ✅ Embedding + retrieval
│   ├── conversationCapture.ts ✅ Async memory storage
│   ├── userInitializer.ts ✅ Firestore triggers
│   ├── zapierIntegration.ts ✅ Webhook handlers
│   ├── slackIntegration.ts ✅ Slack commands
│   ├── schemas.ts (TypeScript types)
│   └── .env.example

lib/
├── ragMemory.ts ✅ Next.js middleware utilities
├── schemas.ts ✅ Zod schemas for all types
└── env.ts ✅ Updated with new env vars
```

## Cloud Functions

### Deployed Functions

#### 1. `initializeUserMemory()` - Firestore Trigger
- **Trigger**: `onWrite` to `users/{userId}`
- **Action**: Initialize memory collections on user signup
- **Stores**: Empty placeholder docs in memories, ragIndex, interactions collections

#### 2. `captureConversationMemory()` - HTTP Function
- **Endpoint**: `/captureMemory`
- **Action**: Store conversation + generate embedding
- **Called from**: Next.js API routes (async)

#### 3. `handleZapierAuth()` - HTTP Function
- **Endpoint**: OAuth callback for Zapier
- **Action**: Store webhook configuration
- **Scopes**: Receive user's Zapier workflow triggers

#### 4. `handleSlackCommand()` - HTTP Function
- **Endpoint**: Slack slash command receiver
- **Commands**: `/genie help`, `/genie stats`, `/genie memory`

#### 5. `handleSlackInteractivity()` - HTTP Function
- **Endpoint**: Slack button/modal interactions
- **Actions**: Enable notifications, view memories, etc.

## Integration Flows

### Zapier Integration

**Setup**:
1. User visits `/integrations/zapier` (dashboard page)
2. Clicks "Connect Zapier"
3. Redirected to Zapier OAuth → returns to `/api/integrations/zapier/callback`
4. Webhook URL stored in Firestore

**Triggered Events**:
- `memory.created` - After conversation stored
- `conversation.completed` - After Gemini response
- `interaction.logged` - After analytics event

**Example Zap**: 
- Trigger: "memory.created" from Genie
- Action: "Create Sheet row" in Google Sheets
- Result: Auto-logging user interactions to spreadsheet

### Slack Integration

**Setup**:
1. Admin creates Slack app at https://api.slack.com
2. User installs app to workspace
3. User links personal account via OAuth
4. Slash command `/genie` enabled

**Available Commands**:
- `/genie help` - Show available commands
- `/genie stats` - View usage statistics
- `/genie memory` - View recent memories
- `/genie notify` - Enable channel notifications

**Features**:
- Real-time memory snapshots posted to channel
- Usage alerts/milestones
- Manual memory triggers
- Integration with other Slack workflows

## Implementation Details

### Memory Capture Flow

```typescript
// In /api/conversation/route.ts
1. Authenticate user (Clerk)
2. Fetch user query
3. Retrieve relevant memories (RAG):
   - Query embedding via Vertex AI
   - Cosine similarity search in Firestore
   - Top N results (default: 5)
4. Inject memories into prompt:
   - Prepend to system instruction
   - Formatted as previous context
5. Send enhanced prompt to Gemini
6. Fire async memory capture:
   - Extract tags from query
   - Generate summary
   - Calculate token count
   - POST to Cloud Function
7. Return response to user

// In Cloud Function (captureConversationMemory)
8. Generate text embedding for summary
9. Store in Firestore with vector
10. Index for RAG in separate collection
11. Update user context (stats)
12. Trigger integrations:
    - POST to Zapier webhook
    - Send Slack notification
```

### Semantic Search Algorithm

```typescript
// Cosine similarity between query and stored memories
similarity = (dotProduct / (magnitude_a * magnitude_b))

// Results filtered by threshold (default: 0.6)
// Sorted by similarity score
// Return top K results
```

## Deployment Checklist

### Prerequisites
- [ ] Google Cloud Project with Vertex AI enabled
- [ ] Firebase Project (already setup)
- [ ] Zapier Developer Account
- [ ] Slack Workspace (admin access)
- [ ] Environment variables configured

### Deployment Steps

1. **Deploy Cloud Functions**:
   ```bash
   cd functions
   npm install
   firebase deploy --only functions
   ```

2. **Update Next.js Environment**:
   - Add all variables from `.env.setup.md`
   - Set `RAG_CLOUD_FUNCTION_URL` to deployed function

3. **Create Firestore Indexes**:
   - Automatic for newer queries
   - Or manually in Firebase Console

4. **Setup Zapier OAuth App**:
   - Copy credentials to `.env.local`
   - Configure webhook endpoint

5. **Setup Slack Bot**:
   - Install to workspace
   - Configure slash commands
   - Set signing secret

6. **Test All Flows**:
   ```bash
   # Test conversation with memory
   curl -X POST http://localhost:3000/api/conversation ...
   
   # Test Slack command
   /genie stats  # in Slack
   
   # Test Zapier webhook
   curl -X POST https://your-zapier-webhook ...
   ```

## Performance Considerations

### Memory Retrieval Speed
- Firestore queries: ~100-500ms
- Embedding generation: ~200-500ms
- Total RAG overhead: ~1 second

**Optimization**:
- Cache embeddings (in production)
- Use Pinecone/Weaviate for faster semantic search
- Batch memory queries

### Firestore Costs
- Read: Memory retrieval queries
- Write: Async memory capture
- Storage: Vector embeddings (~50KB per memory)

**Optimization**:
- Archive old memories (> 90 days) to Cloud Storage
- Use TTL policies for automatic cleanup
- Batch writes where possible

### Cloud Functions Cost
- Invocations: On-demand (pay per call)
- Compute time: Vertex AI embeddings are expensive

**Optimization**:
- Use function memoization for duplicate queries
- Consider embedding cache layer (Redis)
- Monitor function execution times

## Security Considerations

### Data Protection
- User memories encrypted at rest in Firestore
- OAuth tokens stored securely (encrypted)
- API keys never exposed in client code
- CSRF protection via state parameter

### Access Control
- Firestore security rules: User can only access own data
- Cloud Functions authenticated via Clerk
- Webhook signatures verified (Slack/Zapier)

### Privacy
- Memory retention policy (90 days default)
- User deletion cascades to all memories
- Export functionality for user data portability
- GDPR-compliant data handling

## Monitoring & Debugging

### Cloud Functions Logs
```bash
firebase functions:log

# Filter by function
firebase functions:log captureConversationMemory
```

### Firestore Monitoring
- Firebase Console → Firestore Database
- Monitor read/write counts
- Check index performance

### Error Tracking
- Memory capture failures logged (non-blocking)
- Webhook signature errors logged
- Embedding generation errors tracked

### Metrics to Monitor
- Average RAG retrieval time
- Memory storage success rate
- Zapier webhook delivery rate
- Slack command response time
- Firestore query latency

## Future Enhancements

1. **Advanced RAG**:
   - Multi-model embeddings (text + image)
   - Semantic search with filters
   - Memory clustering and summarization

2. **Integration Marketplace**:
   - More integrations (GitHub, Gmail, Teams)
   - Custom webhook builders
   - Workflow automation templates

3. **Analytics Dashboard**:
   - Usage trends
   - Memory effectiveness metrics
   - Integration performance stats

4. **AI Improvements**:
   - Personalization model
   - Memory relevance scoring
   - Conversation quality analysis

## Support & Troubleshooting

See `.env.setup.md` for detailed troubleshooting guide.

### Common Issues

1. **RAG retrieval returns no results**
   - Check embedding generation in Cloud Function logs
   - Verify similarity threshold setting
   - Ensure memories exist in Firestore

2. **Slack commands not working**
   - Verify signing secret in env
   - Check Cloud Function timeout
   - Ensure bot permissions in Slack app

3. **Zapier webhooks not triggering**
   - Check webhook URL configuration
   - Verify user's Zapier integration enabled
   - Monitor Cloud Function logs

---

**Last Updated**: November 2025
**Maintainer**: Genie AI Team
