# Slack Integration Guide for Genie AI

This guide explains how to set up and use the Slack integration for Genie AI, allowing users to interact with Genie directly from Slack.

## Features

- **Direct Messages**: Chat with Genie privately via DM
- **@Mentions**: Mention @Genie in any channel to get help
- **Slash Commands**: Use `/genie` for quick actions
- **Notifications**: Receive updates about your memories

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

### 5. Install App to Workspace

1. Go to **Install App**
2. Click "Install to Workspace"
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 6. Get Signing Secret

1. Go to **Basic Information**
2. Under "App Credentials", copy the **Signing Secret**

### 7. Configure Environment Variables

Add these to your `.env.local` file:

```env
# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_ID=your-app-id
SLACK_CLIENT_SECRET=your-client-secret  # For OAuth flow
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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/integrations/slack/events` | POST | Receives Slack events |
| `/api/integrations/slack/command` | POST | Handles slash commands |
| `/api/integrations/slack/auth` | GET | Initiates OAuth flow |
| `/api/integrations/slack/callback` | GET | OAuth callback |
| `/api/integrations/slack/status` | GET | Check connection status |
| `/api/integrations/slack/test` | POST | Send test message |
| `/api/integrations/slack/disconnect` | POST | Disconnect integration |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SLACK WORKSPACE                          │
│                                                              │
│  User types:                                                 │
│  • /genie ask [question]                                     │
│  • @Genie [message]                                          │
│  • DM to Genie bot                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SLACK API                                 │
│  • Verifies request signature                                │
│  • Routes to appropriate endpoint                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              GENIE AI (Next.js API Routes)                   │
│                                                              │
│  /api/integrations/slack/events                              │
│  ├─ Verify Slack signature                                   │
│  ├─ Handle app_mention events                                │
│  ├─ Handle message.im events                                 │
│  └─ Generate AI response via Gemini                          │
│                                                              │
│  /api/integrations/slack/command                             │
│  ├─ Parse slash command                                      │
│  ├─ Route to appropriate handler                             │
│  └─ Return formatted response                                │
└────────────────────────────────────────────────────────��────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   GOOGLE GEMINI AI                           │
│  • Process user query                                        │
│  • Generate contextual response                              │
│  • Format for Slack markdown                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SLACK API                                 │
│  • Post response to channel/DM                               │
│  • Add reactions (thinking, done)                            │
└──────────────────────────────────────────────���──────────────┘
```

## Response Flow

1. **User sends message** → Slack sends event to webhook
2. **Webhook receives** → Verifies signature, acknowledges immediately
3. **Add reaction** → Shows 🤔 thinking indicator
4. **Generate response** → Calls Gemini AI
5. **Send response** → Posts message to Slack
6. **Update reaction** → Changes to ✅ done

## Troubleshooting

### Bot not responding

1. Check that the bot is invited to the channel
2. Verify environment variables are set correctly
3. Check server logs for errors
4. Ensure Event Subscriptions URL is verified

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
- **Token Storage**: Bot tokens should be stored securely (environment variables)
- **HTTPS**: All endpoints must use HTTPS
- **Timestamp Validation**: Requests older than 5 minutes are rejected

## Production Deployment

### 1. Update Environment Variables

Add these to your production environment (Vercel, etc.):

```env
# Slack Integration (Production)
SLACK_CLIENT_ID=your-production-client-id
SLACK_CLIENT_SECRET=your-production-client-secret
SLACK_BOT_TOKEN=xoxb-your-production-bot-token
SLACK_SIGNING_SECRET=your-production-signing-secret
SLACK_APP_ID=your-production-app-id

# App URL (Required for OAuth)
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
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

## Future Enhancements

- [ ] Thread context awareness (remember conversation in threads)
- [ ] User-specific memory integration
- [ ] File attachment support
- [ ] Interactive buttons and modals
- [ ] Scheduled messages
- [ ] Channel-specific configurations
- [ ] App Home tab with settings
- [ ] Workflow Builder integration

---

## Troubleshooting

### Common Issues

**"dispatch_failed" error**
- Ensure your Request URLs are correct and accessible
- Check that ngrok (dev) or production server is running
- Verify the endpoint returns a 200 response within 3 seconds

**"invalid_client_id" error**
- Use the Client ID from Basic Information > App Credentials
- Not the App ID (which starts with 'A')

**OAuth callback fails**
- Ensure redirect URL is added to Slack's Redirect URLs
- Check that HTTPS is used (required by Slack)
- Verify SLACK_CLIENT_SECRET is correct

**Signature verification fails**
- Ensure SLACK_SIGNING_SECRET matches your app
- Check that the raw request body is used for verification
- Verify timestamp is within 5 minutes

---

For support, check the main documentation or open an issue on GitHub.
