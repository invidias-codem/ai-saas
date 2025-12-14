# Slack Integration Guide for Genie AI

This guide explains how to set up and use the Slack integration for Genie AI, allowing users to interact with Genie directly from Slack.

## 🆕 Multi-Tenant Architecture (v2.0.0)

The Slack integration now supports **multi-tenant** installations, meaning:
- Multiple Slack workspaces can install Genie
- Each workspace has its own bot token stored securely in Firestore
- Tokens are dynamically resolved based on `team_id` from each request
- No more single `SLACK_BOT_TOKEN` environment variable needed

## Features

- **Direct Messages**: Chat with Genie privately via DM
- **@Mentions**: Mention @Genie in any channel to get help
- **Slash Commands**: Use `/genie` for quick actions
- **Interactive Buttons**: Feedback, regenerate, expand responses
- **Settings Modal**: Customize response style and notifications
- **Message Shortcuts**: Summarize any message with a right-click
- **Multi-Workspace Support**: Install to unlimited Slack workspaces

## Setup Instructions

### 1. Create a Slack App

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. Name your app "Genie AI" and select your workspace
5. Click "Create App"

### 2. Configure Bot Token Scopes

Navigate to **OAuth & Permissions** and add these Bot Token Scopes:

```
app_mentions:read    - Read messages that mention the bot
chat:write           - Send messages as the bot
commands             - Add slash commands
im:history           - View messages in DMs
im:read              - View basic DM info
im:write             - Start DMs with users
reactions:write      - Add reactions to messages
users:read           - View user info
```

### 3. Enable Event Subscriptions

1. Go to **Event Subscriptions**
2. Toggle "Enable Events" to ON
3. Set the Request URL to:
   ```
   https://your-domain.com/api/integrations/slack/events
   ```
4. Subscribe to these bot events:
   - `app_mention` - When someone @mentions the bot
   - `message.im` - Direct messages to the bot

### 4. Create Slash Command

1. Go to **Slash Commands**
2. Click "Create New Command"
3. Configure:
   - Command: `/genie`
   - Request URL: `https://your-domain.com/api/integrations/slack/command`
   - Short Description: "Chat with Genie AI"
   - Usage Hint: `[help|ask|code|explain|summarize] [your message]`

### 5. Enable Interactivity

1. Go to **Interactivity & Shortcuts**
2. Toggle "Interactivity" to ON
3. Set the Request URL to:
   ```
   https://your-domain.com/api/integrations/slack/interactivity
   ```
4. (Optional) Add shortcuts:
   - **Global Shortcut**: `ask_genie` - "Ask Genie"
   - **Message Shortcut**: `summarize_message` - "Summarize with Genie"

### 6. Configure OAuth & Permissions

1. Go to **OAuth & Permissions**
2. Add Redirect URL:
   ```
   https://your-domain.com/api/integrations/slack/callback
   ```
3. Install the app to your workspace
4. Note: The bot token is now stored automatically in Firestore

### 7. Get App Credentials

1. Go to **Basic Information**
2. Under "App Credentials", copy:
   - **Client ID**
   - **Client Secret**
   - **Signing Secret**

### 8. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Slack App Credentials (Required)
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
SLACK_SIGNING_SECRET=your-signing-secret

# App URL (Required for OAuth)
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Note: SLACK_BOT_TOKEN is NO LONGER NEEDED
# Tokens are now stored per-workspace in Firestore
```

## Usage

### Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/genie help` | Show all commands | `/genie help` |
| `/genie ask [question]` | Ask anything | `/genie ask What is TypeScript?` |
| `/genie code [request]` | Get coding help | `/genie code Write a React hook` |
| `/genie explain [topic]` | Get explanations | `/genie explain How does OAuth work?` |
| `/genie summarize [text]` | Summarize content | `/genie summarize [paste text]` |

### @Mentions

Mention the bot in any channel where it's invited:

```
@Genie What's the best way to handle errors in JavaScript?
```

### Direct Messages

Open a DM with the Genie bot and chat naturally:

```
You: How do I create a REST API in Node.js?
Genie: Here's how to create a REST API...
```

### Interactive Buttons

Genie responses include interactive buttons:
- 👍 **Helpful** - Mark response as helpful
- 👎 **Not Helpful** - Mark response as not helpful
- 🔄 **Regenerate** - Get a new response
- 📖 **Expand** - Get a more detailed response
- 💾 **Save** - Save to your memory

### Settings Modal

Click the ⚙️ Settings button to customize:
- **Response Style**: Concise, Detailed, or Technical
- **Notifications**: Daily summaries, Memory updates

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/integrations/slack/events` | POST | Receives Slack events |
| `/api/integrations/slack/command` | POST | Handles slash commands |
| `/api/integrations/slack/interactivity` | POST | Handles button clicks & modals |
| `/api/integrations/slack/auth` | GET | Initiates OAuth flow |
| `/api/integrations/slack/callback` | GET | OAuth callback |
| `/api/integrations/slack/status` | GET | Check connection status |
| `/api/integrations/slack/test` | POST | Send test message |
| `/api/integrations/slack/disconnect` | POST | Disconnect integration |

## Multi-Tenant Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                  WORKSPACE A (team_id: T_AAA)               │
│  User: @Genie What is AI?                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    GENIE API ROUTES                          │
│                                                              │
│  1. Extract team_id from payload                             │
│  2. Fetch credentials: getSlackConfig('T_AAA')               │
│  3. Use workspace-specific botToken for API calls            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FIRESTORE                                 │
│                                                              │
│  slackInstallations/T_AAA                                    │
│  ├─ teamId: "T_AAA"                                          │
│  ├─ teamName: "Workspace A"                                  │
│  ├─ botToken: "xoxb-aaa-token"                               │
│  ├─ botUserId: "U_BOT_AAA"                                   │
│  └─ scopes: ["chat:write", "commands", ...]                  │
│                                                              │
│  slackInstallations/T_BBB                                    │
���  ├─ teamId: "T_BBB"                                          │
│  ├─ teamName: "Workspace B"                                  │
│  ├─ botToken: "xoxb-bbb-token"                               │
│  └─ ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

### Firestore Collections

| Collection | Document ID | Description |
|------------|-------------|-------------|
| `slackInstallations` | `{teamId}` | Bot tokens and workspace info |
| `slackInstallationEvents` | Auto-generated | Installation/uninstall events |
| `slackFeedback` | Auto-generated | User feedback on responses |
| `slackMemories` | Auto-generated | Saved responses |
| `slackUserPreferences` | `{teamId}_{userId}` | User settings |

### Token Manager API

```typescript
import { 
  getSlackConfig,
  saveSlackInstallation,
  removeSlackInstallation,
  hasInstallation,
  validateInstallation,
} from '@/lib/slack/tokenManager';

// Get config for a workspace
const config = await getSlackConfig('T123ABC456');
// Returns: { teamId, teamName, botToken, botUserId, scopes }

// Check if workspace is installed
const installed = await hasInstallation('T123ABC456');
// Returns: true/false

// Validate token is still working
const { valid, error } = await validateInstallation('T123ABC456');
```

## Response Flow

```
1. User sends message → Slack sends event to webhook
2. Webhook receives → Verifies signature, extracts team_id
3. Fetch credentials → getSlackConfig(team_id) from Firestore
4. Add reaction → Shows 🤔 thinking indicator
5. Generate response → Calls Gemini AI
6. Send response → Posts message using workspace-specific token
7. Update reaction → Changes to ✅ done
```

## Testing

### Run Tests

```bash
# Run all Slack tests
npm test -- --testPathPatterns=slack

# Run specific test file
npm test -- --testPathPatterns=slack/tokenManager

# Run with coverage
npm test -- --testPathPatterns=slack --coverage
```

### Test Coverage

| Test File | Tests | Description |
|-----------|-------|-------------|
| `tokenManager.test.ts` | 22 | Token manager unit tests |
| `events.test.ts` | 11 | Events API handler tests |
| `command.test.ts` | 14 | Slash command handler tests |
| `interactivity.test.ts` | 17 | Interactivity handler tests |
| `callback.test.ts` | 13 | OAuth callback tests |
| `integration.test.ts` | 13 | End-to-end integration tests |

**Total: 90 tests**

## Troubleshooting

### Bot not responding

1. Check that the bot is invited to the channel
2. Verify environment variables are set correctly
3. Check server logs for errors
4. Ensure Event Subscriptions URL is verified
5. **NEW**: Check Firestore for installation record

### "workspace_not_installed" error

This means the workspace doesn't have a valid installation in Firestore:
1. Have the user reinstall the app via OAuth
2. Check `slackInstallations` collection in Firestore
3. Verify the `botToken` field exists and is valid

### Invalid signature errors

1. Verify `SLACK_SIGNING_SECRET` is correct
2. Check that the request body is being parsed correctly
3. Ensure timestamp is within 5 minutes

### Rate limiting

Slack has rate limits. If you hit them:
- Implement exponential backoff
- Queue messages for batch processing
- Use Slack's `response_url` for delayed responses

## Security Considerations

- **Signature Verification**: All requests are verified using HMAC-SHA256
- **Token Storage**: Bot tokens stored securely in Firestore (not env vars)
- **HTTPS**: All endpoints must use HTTPS
- **Timestamp Validation**: Requests older than 5 minutes are rejected
- **Multi-Tenant Isolation**: Each workspace's token is isolated

## Production Deployment

### 1. Update Environment Variables

Add these to your production environment (Vercel, etc.):

```env
# Slack App Credentials (Production)
SLACK_CLIENT_ID=your-production-client-id
SLACK_CLIENT_SECRET=your-production-client-secret
SLACK_SIGNING_SECRET=your-production-signing-secret

# App URL (Required for OAuth)
NEXT_PUBLIC_APP_URL=https://your-production-domain.com

# Firebase (for token storage)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 2. Update Slack App URLs

In your Slack App settings, update all URLs to your production domain:

1. **OAuth & Permissions > Redirect URLs**:
   ```
   https://your-production-domain.com/api/integrations/slack/callback
   ```

2. **Event Subscriptions > Request URL**:
   ```
   https://your-production-domain.com/api/integrations/slack/events
   ```

3. **Slash Commands > /genie Request URL**:
   ```
   https://your-production-domain.com/api/integrations/slack/command
   ```

4. **Interactivity & Shortcuts > Request URL**:
   ```
   https://your-production-domain.com/api/integrations/slack/interactivity
   ```

### 3. Enable Distribution

1. Go to your Slack App settings
2. Navigate to **Manage Distribution**
3. Complete the checklist:
   - Add a collaborator
   - Review scopes
   - Set up OAuth redirect URLs
4. Click **Activate Public Distribution**

### 4. Submit to Slack Marketplace

See `SLACK_MARKETPLACE_CHECKLIST.md` for the full submission checklist.

---

## Changelog

### v2.0.0 (Current)
- ✅ Multi-tenant architecture with Firestore token storage
- ✅ Dynamic token resolution per workspace
- ✅ Interactivity handler for buttons and modals
- ✅ Feedback collection (helpful/not helpful)
- ✅ Response regeneration
- ✅ Settings modal for user preferences
- ✅ Message shortcuts (summarize)
- ✅ Comprehensive test suite (90 tests)

### v1.0.0
- Initial Slack integration
- Single workspace support
- Events API handler
- Slash commands

---

## Future Enhancements

- [ ] Thread context awareness (remember conversation in threads)
- [ ] User-specific memory integration
- [ ] File attachment support
- [ ] Scheduled messages
- [ ] Channel-specific configurations
- [ ] App Home tab with settings
- [ ] Workflow Builder integration
- [ ] Analytics dashboard for workspace admins

---

For support, check the main documentation or open an issue on GitHub.
