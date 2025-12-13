# Slack Marketplace Submission Checklist

This checklist helps prepare Genie AI for the Slack Marketplace submission.

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

---

## 📄 Required Pages

### Landing Page
- [ ] Clear overview of Genie AI and its features
- [ ] Screenshots/GIFs showing app in Slack
- [ ] "Add to Slack" button
- [ ] Clear path to installation
- [ ] Publicly accessible (no login required)

**Suggested URL**: `https://your-domain.com/slack`

### Support Page
- [ ] Clear contact method (email or form)
- [ ] No account required to get support
- [ ] Response time commitment (within 2 business days)
- [ ] Publicly accessible

**Suggested URL**: `https://your-domain.com/support`

### Privacy Policy Page
- [ ] What data is collected
- [ ] How data is used
- [ ] Data retention period
- [ ] How to request data access/deletion
- [ ] Contact information for data requests
- [ ] Publicly accessible

**Suggested URL**: `https://your-domain.com/privacy`

---

## 🎨 Marketplace Listing Assets

### Images & Screenshots (1600x1000px, 8:5 ratio)
- [ ] Screenshot 1: Slash command in action
- [ ] Screenshot 2: @mention response
- [ ] Screenshot 3: DM conversation
- [ ] Screenshot 4: Help command output

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
- [x] Tokens stored securely (environment variables)
- [x] Not logging tokens
- [x] Not exposing tokens to end users

### Request Verification
- [x] Verifying Slack signatures on all endpoints
- [x] Using signing secret (not verification token)
- [x] Timestamp validation (within 5 minutes)

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

### Notifications
- [x] Not spamming users
- [x] Not using @channel or @everyone
- [x] Not posting to #general by default
- [x] Using reactions for status (thinking, done)

---

## 📋 Pre-Submission Checklist

### Testing
- [ ] Test on at least 5 active workspaces
- [ ] Test all slash commands
- [ ] Test @mentions
- [ ] Test DMs
- [ ] Test error scenarios
- [ ] Test with different user permissions

### Documentation
- [ ] Update SLACK_INTEGRATION_GUIDE.md
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
# Slack Integration (Production)
SLACK_CLIENT_ID=your-production-client-id
SLACK_CLIENT_SECRET=your-production-client-secret
SLACK_BOT_TOKEN=xoxb-your-production-bot-token
SLACK_SIGNING_SECRET=your-production-signing-secret
SLACK_APP_ID=your-production-app-id

# App URL (Production)
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

### Slack App Settings (Production)
1. Update OAuth Redirect URLs:
   - `https://your-production-domain.com/api/integrations/slack/callback`

2. Update Event Subscriptions Request URL:
   - `https://your-production-domain.com/api/integrations/slack/events`

3. Update Slash Command Request URL:
   - `https://your-production-domain.com/api/integrations/slack/command`

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

## 📚 Resources

- [Slack Marketplace Overview](https://docs.slack.dev/slack-marketplace/)
- [App Guidelines & Requirements](https://docs.slack.dev/slack-marketplace/slack-marketplace-app-guidelines-and-requirements)
- [Review Guide](https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide)
- [Distributing Your App](https://docs.slack.dev/slack-marketplace/distributing-your-app-in-the-slack-marketplace)
- [Security Best Practices](https://docs.slack.dev/security)

---

## Notes

- Apps must be installed on at least 5 active workspaces before submission
- Review process typically takes 1-2 weeks
- Be responsive to reviewer feedback
- Keep app updated after approval
