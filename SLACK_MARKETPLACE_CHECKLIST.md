# Slack Marketplace Submission Checklist

This checklist helps prepare Genie AI for the Slack Marketplace submission.

**Version:** 2.0.0 (Multi-Tenant)  
**Last Updated:** January 2025

---

## ✅ Distribution Prerequisites

### Enable Features & Functionality
- [x] **Events API** - Enabled and verified
- [x] **Slash Commands** - `/genie` configured
- [x] **Interactivity** - Buttons, modals, shortcuts enabled
- [x] **OAuth Flow** - Complete installation flow

### Add OAuth Redirect URLs
- [x] **Production URL**: `https://your-domain.com/api/integrations/slack/callback`
- [ ] Verify URL is added in Slack App Settings → OAuth & Permissions → Redirect URLs

### Remove Hard Coded Information
- [x] **No hardcoded OAuth tokens** - Tokens stored in Firestore per workspace
- [x] **No hardcoded webhook URLs** - All URLs from environment variables
- [x] **Dynamic token resolution** - Using `getSlackConfig(teamId)` for all API calls
- [x] **SLACK_BOT_TOKEN removed** - No longer using single bot token

### Use HTTPS For Your Features
- [ ] **Events URL**: `https://your-domain.com/api/integrations/slack/events`
- [ ] **Command URL**: `https://your-domain.com/api/integrations/slack/command`
- [ ] **Interactivity URL**: `https://your-domain.com/api/integrations/slack/interactivity`
- [ ] **OAuth Callback**: `https://your-domain.com/api/integrations/slack/callback`
- [ ] All endpoints use TLS 1.2+

---

## ✅ App Configuration

### Basic Information
- [ ] **App Name**: "Genie AI" (unique, easy to remember)
- [ ] **Short Description** (10 words max): "AI assistant for conversations, code, and productivity in Slack"
- [ ] **Long Description**: Detailed explanation of features and value
- [ ] **App Icon**: High-quality, distinctive icon (512x512 minimum)
- [ ] **App Category**: Productivity / AI & Machine Learning

### OAuth & Permissions
- [x] Bot Token Scopes configured:
  - `app_mentions:read` - Read messages that mention the bot
  - `chat:write` - Send messages as the bot
  - `commands` - Add slash commands
  - `im:history` - View messages in DMs
  - `im:read` - View basic DM info
  - `im:write` - Start DMs with users
  - `reactions:write` - Add reactions to messages
  - `users:read` - View user info

### Event Subscriptions
- [x] Events API enabled
- [x] Request URL verified
- [x] Bot events subscribed:
  - `app_mention`
  - `message.im`

### Slash Commands
- [x] `/genie` command configured
- [x] Request URL set
- [x] Short description: "Chat with Genie AI"
- [x] Usage hint: "[help|ask|code|explain|summarize] [your message]"

### Interactivity & Shortcuts
- [x] Interactivity enabled
- [x] Request URL set: `/api/integrations/slack/interactivity`
- [x] Shortcuts configured (optional):
  - Global: `ask_genie` - "Ask Genie"
  - Message: `summarize_message` - "Summarize with Genie"

---

## 📄 Required Pages

### Landing Page
- [ ] Clear overview of Genie AI and its features
- [ ] Screenshots/GIFs showing app in Slack
- [ ] "Add to Slack" button
- [ ] Clear path to installation
- [ ] Publicly accessible (no login required)

**URL**: `https://your-domain.com/slack`

### Support Page
- [ ] Clear contact method (email or form)
- [ ] No account required to get support
- [ ] Response time commitment (within 2 business days)
- [ ] Publicly accessible

**URL**: `https://your-domain.com/support`

### Privacy Policy Page
- [ ] What data is collected
- [ ] How data is used
- [ ] Data retention period
- [ ] How to request data access/deletion
- [ ] Contact information for data requests
- [ ] Publicly accessible

**URL**: `https://your-domain.com/privacy`

---

## 🎨 Marketplace Listing Assets

### Images & Screenshots (1600x1000px, 8:5 ratio)
- [ ] Screenshot 1: Slash command in action
- [ ] Screenshot 2: @mention response
- [ ] Screenshot 3: DM conversation
- [ ] Screenshot 4: Interactive buttons (feedback, regenerate)
- [ ] Screenshot 5: Settings modal

### Video (Optional but recommended)
- [ ] 30-90 seconds length
- [ ] Shows app working in Slack
- [ ] Publicly accessible YouTube link
- [ ] Closed captions enabled
- [ ] Ads disabled

---

## 🔒 Security Requirements

### OAuth & Tokens
- [x] Using `state` parameter for CSRF protection
- [x] Tokens stored securely in Firestore (not env vars)
- [x] Not logging tokens
- [x] Not exposing tokens to end users
- [x] Token validation on startup

### Request Verification
- [x] Verifying Slack signatures on all endpoints
- [x] Using signing secret (not verification token)
- [x] Timestamp validation (within 5 minutes)

### Multi-Tenant Security
- [x] Workspace isolation (each team has own token)
- [x] Token lookup by team_id only
- [x] No cross-workspace data access
- [x] Installation events logged for audit

### TLS
- [ ] All endpoints use HTTPS (TLS 1.2+)
- [ ] Production domain with valid SSL certificate

---

## 🤖 AI-Specific Requirements

### Transparency
- [ ] Disclose use of LLM (Google Gemini) in listing
- [ ] Add disclaimer about potential inaccurate responses
- [ ] Document data handling by LLM

### Security & Compliance Fields
- [ ] Model used: Google Gemini 2.0 Flash
- [ ] Data retention: [Specify your policy]
- [ ] LLM data tenancy: [Specify]
- [ ] LLM data residency: [Specify]

### Prohibited Actions
- [x] NOT using Slack data to train LLMs
- [x] NOT joining all public channels by default
- [x] NOT performing unexpected actions

---

## 👤 User Experience

### Onboarding
- [x] Clear next steps after installation
- [x] Help command available (`/genie help`)
- [x] Error messages are helpful and actionable
- [x] Support information accessible

### Slash Commands
- [x] Unique command name (`/genie`)
- [x] Help response for unknown input
- [x] Ephemeral responses for errors
- [x] Clear usage hints

### Interactive Elements
- [x] Feedback buttons (helpful/not helpful)
- [x] Regenerate response button
- [x] Expand response button
- [x] Settings modal
- [x] Save to memory button

### Notifications
- [x] Not spamming users
- [x] Not using @channel or @everyone
- [x] Not posting to #general by default
- [x] Using reactions for status (thinking, done)

---

## 🧪 Testing Requirements

### Test Coverage
- [x] **90 tests** across 6 test suites
- [x] Token manager tests (22 tests)
- [x] Events API tests (11 tests)
- [x] Command handler tests (14 tests)
- [x] Interactivity tests (17 tests)
- [x] OAuth callback tests (13 tests)
- [x] Integration tests (13 tests)

### Manual Testing
- [ ] Test on at least 5 active workspaces
- [ ] Test all slash commands
- [ ] Test @mentions
- [ ] Test DMs
- [ ] Test interactive buttons
- [ ] Test settings modal
- [ ] Test error scenarios
- [ ] Test with different user permissions

---

## 📋 Pre-Submission Checklist

### Code Review
- [x] No hardcoded tokens or secrets
- [x] All API calls use dynamic token resolution
- [x] Error handling for missing installations
- [x] Graceful degradation for API failures

### Documentation
- [x] SLACK_INTEGRATION_GUIDE.md updated
- [ ] Create user-facing documentation
- [ ] Prepare FAQ

### App Settings
- [ ] Add collaborator to app
- [ ] Enable "Distribute App" in settings
- [ ] Configure Redirect URLs for production
- [ ] Set up Direct Install (optional)

---

## 🚀 Production Deployment

### Environment Variables (Production)
```env
# Slack App Credentials (Required)
SLACK_CLIENT_ID=your-production-client-id
SLACK_CLIENT_SECRET=your-production-client-secret
SLACK_SIGNING_SECRET=your-production-signing-secret

# App URL (Required for OAuth)
NEXT_PUBLIC_APP_URL=https://your-production-domain.com

# Firebase (for token storage)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google AI (for Gemini)
GOOGLE_API_KEY=your-google-api-key

# NOTE: SLACK_BOT_TOKEN is NO LONGER NEEDED
# Tokens are stored per-workspace in Firestore
```

### Slack App Settings (Production)

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

---

## 📝 Submission Information

### App Details
- **App Name**: Genie AI
- **Short Description**: AI assistant for conversations, code, and productivity in Slack
- **Category**: Productivity
- **Pricing**: [Free / Paid / Freemium]
- **Languages**: English

### Contact Information
- **Developer Contact**: [Your email]
- **Support Contact**: [Support email]
- **Privacy Policy URL**: [URL]
- **Support URL**: [URL]
- **Landing Page URL**: [URL]

---

## 🗄️ Firestore Collections

The multi-tenant architecture uses these Firestore collections:

| Collection | Document ID | Purpose |
|------------|-------------|---------|
| `slackInstallations` | `{teamId}` | Bot tokens and workspace info |
| `slackInstallationEvents` | Auto-generated | Installation/uninstall audit log |
| `slackFeedback` | Auto-generated | User feedback on responses |
| `slackMemories` | Auto-generated | Saved responses |
| `slackUserPreferences` | `{teamId}_{userId}` | User settings |

---

## 📚 Resources

- [Slack Marketplace Overview](https://docs.slack.dev/slack-marketplace/)
- [App Guidelines & Requirements](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements)
- [Review Guide](https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide)
- [Distributing Your App](https://docs.slack.dev/slack-marketplace/distributing-your-app-in-the-slack-marketplace)
- [Security Best Practices](https://docs.slack.dev/security)
- [Messaging Documentation](https://docs.slack.dev/messaging/)

---

## ✅ Final Checklist Before Activation

Before clicking "Activate Public Distribution":

- [ ] All OAuth Redirect URLs added
- [ ] All Request URLs use HTTPS
- [ ] No hardcoded tokens (confirmed - using Firestore)
- [ ] Tested OAuth flow end-to-end
- [ ] Tested on multiple workspaces
- [ ] Landing page live
- [ ] Support page live
- [ ] Privacy policy live
- [ ] App icon uploaded
- [ ] Screenshots prepared

---

## Notes

- Apps must be installed on at least 5 active workspaces before submission
- Review process typically takes 1-2 weeks
- Be responsive to reviewer feedback
- Keep app updated after approval
- Multi-tenant architecture ensures each workspace is isolated
