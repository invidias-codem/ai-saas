# System Architecture Diagram

## End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INTERACTION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              GENIE AI USER
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   Sign Up / Login (Clerk)    │
                    │                              │
                    │  Cloud Function Triggers:    │
                    │  ✓ initializeUserMemory()    │
                    └──────────────┬───────────────┘
                                   │
                      Creates Collections:
                    ┌────────────────────────────┐
                    │ memories/  ragIndex/       │
                    │ interactions/ context/     │
                    │ integrations/              │
                    └────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  User Types Query            │
                    │  "Help with React?"          │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │  /api/conversation           │
                    │  (Next.js Route)             │
                    └──────────────┬───────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
   STEP 1:              STEP 2:              STEP 3:
   Auth Check           Retrieve Memories    Generate Response
   
   ✓ userId valid       ✓ Query embedding    ✓ Inject context
                        ✓ Semantic search    ✓ Call Gemini
                        ✓ Format context     ✓ Get response
                        
                                   │
                    ┌──────────────┴───────────────┐
                    │                              │
                    ▼                              ▼
            Return to User              STEP 4: Async Capture
                (0ms blocking)           (Cloud Function)
            
                                   │
                    ┌──────────────┴───────────────┐
                    │  captureConversationMemory()  │
                    │  (Cloud Function)             │
                    └──────────────┬────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
    Generate             Store in         Trigger
    Embedding            Firestore        Integrations
    
    • Vertex AI          • memories/      • Zapier Webhook
    • Text-embedding-    • ragIndex/      • Slack Notification
      004                • interaction    • Update Context
    • 768 dims           • event


┌─────────────────────────────────────────────────────────────────────────────┐
│                         MEMORY STORAGE LAYER                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         Firestore Database

    users/{userId}/
    │
    ├─ memories/
    │  └─ {memoryId}
    │     ├─ id: "mem_123"
    │     ├─ featureType: "conversation"
    │     ├─ title: "React Best Practices"
    │     ├─ summary: "Discussed hooks, performance..."
    │     ├─ messages: [...]
    │     ├─ embedding: [0.12, 0.45, -0.33, ...] (768 dims)
    │     └─ tags: ["react", "hooks", "performance"]
    │
    ├─ ragIndex/
    │  └─ {indexId}
    │     ├─ memoryId: "mem_123"
    │     ├─ embedding: [0.12, 0.45, -0.33, ...]
    │     ├─ summary: "React Best Practices"
    │     └─ featureType: "conversation"
    │
    ├─ interactions/
    │  └─ {eventId}
    │     ├─ featureType: "conversation"
    │     ├─ tokensUsed: 1200
    │     ├─ duration: 2500ms
    │     └─ success: true
    │
    ├─ context/
    │  └─ profile/
    │     ├─ totalInteractions: 42
    │     ├─ totalTokensUsed: 125000
    │     ├─ preferredFeatures: ["conversation", "code"]
    │     └─ integrations: {zapierEnabled: true, slackEnabled: true}
    │
    └─ integrations/
       ├─ zapier/
       │  └─ webhookUrl: "https://hooks.zapier.com/..."
       └─ slack/
          └─ slackChannelId: "C1234567"


┌─────────────────────────────────────────────────────────────────────────────┐
│                      SEMANTIC SEARCH (RAG RETRIEVAL)                        │
└─────────────────────────────────────────────────────────────────────────────┘

User Query: "How do I optimize performance?"
                    │
                    ▼
         Generate Embedding (Vertex AI)
         "optimize performance" → [0.21, 0.55, -0.12, ...]
                    │
                    ▼
         ┌────────────────────────────────┐
         │ Retrieve All Memories          │
         │ for User from Firestore        │
         └────────────────────────────────┘
                    │
                    ▼
         ┌────────────────────────────────┐
         │ Calculate Similarity Scores    │
         │ (Cosine Similarity)            │
         └────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
Memory 1        Memory 2        Memory 3
Title:          Title:          Title:
"React Perf"    "Database"      "CSS Optimization"
Similarity:     Similarity:     Similarity:
0.92            0.45            0.38 ❌ (below threshold)
✓ Include       ✓ Include       ✗ Excluded
                    │
                    ▼
         Filter: similarity ≥ 0.6 (threshold)
         Sort: highest similarity first
         Limit: Top 5 results
                    │
                    ▼
         ┌────────────────────────────────┐
         │ Format for Prompt Injection    │
         │                                │
         │ "## Previous Interactions      │
         │ **React Performance** - Talked │
         │ about memoization, useCallback │
         │ ...                            │
         │                                │
         │ **Database Optimization** ...  │
         └────────────────────────────────┘
                    │
                    ▼
    Inject into Gemini Prompt
    (Combined with user query)


┌─────────────────────────────────────────────────────────────────────────────┐
│                        ZAPIER INTEGRATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

User: "Connect Zapier"
         │
         ▼
    OAuth Flow
    /api/integrations/zapier/auth
         │
         ▼ (User authorizes)
         │
    /api/integrations/zapier/callback
         │
         ▼ (Store webhook URL in Firestore)
         │
User can now create Zaps:
         │
    ┌────┴────┐
    ▼         ▼
Trigger:  Action:
"Memory   "Create row
Created"   in Sheet"
         │
         ▼
When memory created:
         │
    Cloud Function
    triggerZapierWebhook()
         │
    POST to Zapier:
    {
      event: "memory.created",
      userId: "user_123",
      data: { memoryId, title, tags }
    }
         │
    Zapier receives
         │
    Google Sheet updated
    CRM updated
    Email sent
    etc.


┌─────────────────────────────────────────────────────────────────────────────┐
│                         SLACK INTEGRATION FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

User: "Connect Slack Bot"
         │
         ▼
    OAuth Flow
    /api/integrations/slack/auth
         │
         ▼ (User approves bot)
         │
    /api/integrations/slack/callback
         │
         ▼ (Bot installed to workspace)
         │
    ┌─────────────────────────────────┐
    │ User can now:                   │
    │                                 │
    │ /genie help                     │
    │ /genie stats                    │
    │ /genie memory                   │
    │ /genie notify                   │
    └──────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
Manual Commands      Automatic Notifications
(User triggered)     (Memory created)
    │                     │
    ▼                     ▼
/genie stats       Memory stored
    │              in Firestore
    ▼              │
Cloud Function     ▼
handleSlack       sendSlackNotification()
Command()          │
    │              ▼
    ▼          Cloud Function
Slack API      posts to user's
Posts stats    channel
    │              │
    ▼              ▼
User sees       User notified
response        of new memory


┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐
│   Frontend (Next.js)       │
│   ├─ Components            │
│   ├─ Pages                 │
│   └─ API Routes ────┐      │
└────────────────────────────┘
                    │
                    ▼
┌────────────────────────────┐
│   Next.js API Layer        │
│   ├─ /api/conversation ──┐ │
│   ├─ /api/integrations ──┼─┼──► OAuth Flows
│   └─ RAG utilities ───┐   │
└────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
    ┌────────────────────┐
    │  Firebase          │
    │  ├─ Firestore      │
    │  ├─ Auth           │
    │  └─ Functions ─┐   │
    └────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
    Cloud            External Services
    Functions         ├─ Vertex AI
    ├─ RAG            ├─ Zapier
    ├─ Memory         ├─ Slack
    ├─ Integration    └─ Google Sheets


┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING STRATEGY                             │
└─────────────────────────────────────────────────────────────────────────────┘

API Request
    │
    ├─ Auth Error? ──────────► Return 401
    │
    ├─ Validation Error? ─────► Return 400
    │
    ├─ Generate Response ──────► Success
    │                               │
    │                    ┌──────────┘
    │                    │
    │   ┌────────────────┴─────────────────┐
    │   │                                  │
    │   ▼ (Async - Non-blocking)          ▼
    │
    │  Memory Capture                    Return Response
    │  ├─ Embedding Error?               to User
    │  │  └─ Log & Continue              ✓ User gets answer
    │  ├─ Firestore Error?
    │  │  └─ Log & Continue
    │  └─ Integration Error?
    │     └─ Log & Continue
    │
    └─ All errors logged for debugging
       No impact on user experience


```

---

## Key Metrics

```
Response Time Breakdown:
├─ Auth Check: 10ms
├─ Memory Retrieval: 800ms
│  ├─ Embedding generation: 300ms
│  ├─ Database query: 200ms
│  ├─ Similarity calculation: 200ms
│  └─ Formatting: 100ms
├─ Gemini Call: 2000ms
├─ Format Response: 50ms
└─ Total: ~2.86 seconds (vs 2 seconds baseline)
   Additional overhead: ~0.86 seconds (43%)

Firestore Operations per Conversation:
├─ Reads: 1 (memory retrieval)
├─ Writes: 1 (memory storage - async)
└─ Cost: ~$0.0000006 per operation

Cloud Functions per Conversation:
├─ Invocations: 1 (async capture)
├─ Duration: 500-1000ms
└─ Cost: ~$0.000005 per call
```

---

**This architecture provides a scalable, reliable system for RAG memory and integrations in Genie AI.**
