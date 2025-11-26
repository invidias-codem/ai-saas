# Quick Reference: RAG Memory + Integrations

## File Locations

```
📁 Root Project
├── 📄 .env.local (create - add all env vars)
├── 📄 .env.setup.md (guide)
├── 📄 RAG_INTEGRATION_GUIDE.md (full docs)
├── 📄 IMPLEMENTATION_SUMMARY.md (what was built)
├── 📄 USAGE_EXAMPLES.md (examples)
│
├── 📁 functions/
│   ├── package.json ✅
│   ├── tsconfig.json ✅
│   ├── .env.example ✅
│   └── src/
│       ├── index.ts ✅
│       ├── ragMemoryService.ts ✅
│       ├── conversationCapture.ts ✅
│       ├── userInitializer.ts ✅
│       ├── zapierIntegration.ts ✅
│       ├── slackIntegration.ts ✅
│       └── schemas.ts ✅
│
├── 📁 lib/
│   ├── ragMemory.ts ✅
│   ├── schemas.ts ✅ (updated)
│   └── env.ts ✅ (updated)
│
└── 📁 app/api/
    ├── conversation/route.ts ✅ (updated)
    └── integrations/
        ├── zapier/
        │   ├── auth/route.ts ✅
        │   ├── callback/route.ts ✅
        │   └── webhooks/route.ts ✅
        └── slack/
            ├── auth/route.ts ✅
            ├── callback/route.ts ✅
            └── webhooks/route.ts ✅
```

## Environment Variables Needed

```bash
# Core (existing)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
GOOGLE_API_KEY=...
GOOGLE_PROJECT_ID=genie-ai-1ca85
GCP_SERVICE_ACCOUNT_KEY_JSON={...}

# RAG Memory (NEW)
NEXT_PUBLIC_RAG_ENABLED=true
RAG_CLOUD_FUNCTION_URL=https://us-central1-genie-ai-1ca85.cloudfunctions.net

# Zapier (NEW)
ZAPIER_CLIENT_ID=...
ZAPIER_CLIENT_SECRET=...

# Slack (NEW)
SLACK_APP_ID=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

## Key API Endpoints

### Next.js Routes
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/conversation` | POST | Chat with RAG context |
| `/api/integrations/zapier/auth` | GET | Start Zapier OAuth |
| `/api/integrations/zapier/callback` | GET | Zapier OAuth redirect |
| `/api/integrations/zapier/webhooks` | POST | Receive Zapier events |
| `/api/integrations/slack/auth` | GET | Start Slack OAuth |
| `/api/integrations/slack/callback` | GET | Slack OAuth redirect |

### Cloud Functions
| Function | Type | Purpose |
|----------|------|---------|
| `initializeUserMemory` | Firestore Trigger | Create collections on signup |
| `captureConversationMemory` | HTTP | Store memory + embeddings |
| `handleZapierAuth` | HTTP | Configure Zapier webhook |
| `handleZapierWebhook` | HTTP | Receive Zapier events |
| `handleSlackCommand` | HTTP | Process `/genie` commands |
| `handleSlackInteractivity` | HTTP | Handle button clicks |

## Firestore Collections

```
users/{userId}/
├── memories/           # Conversations + interactions
├── ragIndex/          # Vector embeddings for search
├── interactions/      # Event analytics
├── context/
│   └── profile/       # User stats + preferences
└── integrations/
    ├── zapier/        # Zapier config
    └── slack/         # Slack config
```

## Deployment Steps

```bash
# 1. Deploy Cloud Functions
cd functions
npm install
firebase deploy --only functions

# 2. Get deployed function URL
firebase functions:list

# 3. Update .env.local with function URL
RAG_CLOUD_FUNCTION_URL=https://...

# 4. Deploy Next.js (if using Vercel)
vercel deploy

# 5. Configure OAuth apps
# - Zapier: https://developer.zapier.com
# - Slack: https://api.slack.com/apps

# 6. Set redirects in OAuth apps
# Zapier: https://yourdomain.com/api/integrations/zapier/callback
# Slack: https://yourdomain.com/api/integrations/slack/callback

# 7. Add tokens to .env.local
```

## Testing Checklist

```
[ ] Memory creation
    - Send message to /api/conversation
    - Check Firestore for new memory document
    - Check embedding was generated

[ ] Memory retrieval
    - Second message on similar topic
    - Verify memory context injected (check logs)
    
[ ] Zapier webhook
    - Configure test Zap
    - Verify webhook received in Cloud Function logs
    
[ ] Slack commands
    - Type /genie help
    - Type /genie stats
    - Verify responses appear

[ ] Integrations triggered
    - Create memory
    - Verify Zapier webhook POST in logs
    - Verify Slack notification (if enabled)
```

## Common Commands

```bash
# View Cloud Function logs
firebase functions:log

# View specific function
firebase functions:log captureConversationMemory

# Check Firestore size
firebase firestore:list-databases

# Deploy only functions
firebase deploy --only functions

# Test locally
npm run dev  # Next.js
firebase emulators:start --only functions  # Cloud Functions
```

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| Memories not storing | Check Cloud Function logs + Firestore quota |
| RAG not injecting context | Verify `RAG_CLOUD_FUNCTION_URL` set correctly |
| Zapier webhook failing | Check signature + webhook URL accessible |
| Slack commands not working | Verify `/genie` command registered + signing secret |
| Embeddings generation slow | Check Vertex AI API quota + network latency |

## Cost Estimates

| Service | Cost | Notes |
|---------|------|-------|
| Vertex AI Embeddings | ~$0.02/1M tokens | 1 embedding ~200 tokens |
| Firestore | $0.06/100K reads | High read volume for RAG search |
| Cloud Functions | $0.40/1M invocations | Called async per conversation |
| Slack/Zapier | Free (API limits) | No direct costs |

## Security Checklist

- [ ] OAuth state tokens verified (CSRF protection)
- [ ] Webhook signatures validated
- [ ] User data isolated by userId in Firestore
- [ ] API keys not logged or exposed in client
- [ ] Firestore security rules restrict access
- [ ] Encryption for sensitive integration tokens

## Next Steps

1. **Configure environment variables** → See `.env.setup.md`
2. **Deploy Cloud Functions** → Run `firebase deploy --only functions`
3. **Set up Zapier OAuth** → Create developer app, get credentials
4. **Set up Slack Bot** → Create app, configure commands
5. **Test all flows** → Follow testing checklist
6. **Monitor and iterate** → Watch logs, adjust thresholds

---

**Last Updated**: November 2025
**Quick Start Time**: ~2 hours
**Complexity**: Medium (OAuth + Cloud Functions)
