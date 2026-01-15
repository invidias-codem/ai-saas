# Slack Integration Quick Fix Guide

## 🚨 Missing Scope Error (Slide Decks)

If you see this error when generating slides:
```
[SLIDE_HANDLER] Failed to upload file: missing_scope
```

### Fix (2 minutes):

1. **Go to Slack App Settings**
   - Visit: https://api.slack.com/apps
   - Select your "Genie AI" app

2. **Add Missing Scope**
   - Click **OAuth & Permissions** (left sidebar)
   - Scroll to **Bot Token Scopes**
   - Click **Add an OAuth Scope**
   - Add: `files:write`

3. **Reinstall the App** (CRITICAL!)
   - Scroll to top of OAuth & Permissions page
   - Click **Reinstall to Workspace**
   - Approve the new permissions

4. **Test**
   - In Slack: `@Genie create a slide deck about AI`
   - Should now work! ✅

---

#### `invalid_arguments` Error (Fixed)

**Symptom**:
```
[SLIDE_HANDLER] Failed to get upload URL: invalid_arguments
```

**Cause**: The `files.getUploadURLExternal` API requires `application/x-www-form-urlencoded` format, but JSON was sent (or vice versa depending on API version).

**Solution**:
We updated the handler to use `URLSearchParams` for the request body. Ensure you are on the latest commit.

```bash
git pull origin main
```

---

## Required Scopes Checklist

Make sure your Slack app has ALL of these:

- [x] `app_mentions:read` - Read @mentions
- [x] `chat:write` - Send messages
- [x] `commands` - Slash commands
- [x] `files:write` - **Upload slide decks** ⚠️
- [x] `im:history` - Read DM history
- [x] `im:read` - Read DM info
- [x] `im:write` - Send DMs
- [x] `reactions:write` - Add reactions
- [x] `users:read` - **Resolve @mentions for calendar** ⚠️

**Missing any?** Add them and reinstall!

---

## Quick Links

- **Add Scope**: https://api.slack.com/apps → Your App → OAuth & Permissions
- **Reinstall**: https://your-domain.com/api/integrations/slack/auth
- **Full Guide**: See `SLACK_INTEGRATION_GUIDE.md`

---

## Still Having Issues?

1. Check Vercel logs for specific error
2. Verify all environment variables are set
3. Ensure Firestore has bot token for your team_id
4. Try reinstalling the app completely
