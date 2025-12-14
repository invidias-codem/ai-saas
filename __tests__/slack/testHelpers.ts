/**
 * Slack Test Helpers
 * Utilities for testing Slack integration
 */

/**
 * Create a mock Slack installation
 */
export function createMockInstallation(overrides?: Partial<MockInstallation>): MockInstallation {
  return {
    teamId: 'T' + Math.random().toString(36).substring(2, 11).toUpperCase(),
    teamName: 'Test Workspace',
    botToken: 'xoxb-' + Math.random().toString(36).substring(2, 20),
    botUserId: 'U' + Math.random().toString(36).substring(2, 11).toUpperCase(),
    installedBy: {
      slackUserId: 'U' + Math.random().toString(36).substring(2, 11).toUpperCase(),
      clerkUserId: 'user_' + Math.random().toString(36).substring(2, 15),
    },
    scopes: ['chat:write', 'commands', 'app_mentions:read', 'im:history'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

export interface MockInstallation {
  teamId: string;
  teamName: string;
  botToken: string;
  botUserId: string;
  installedBy: {
    slackUserId: string;
    clerkUserId?: string;
  };
  scopes: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Create a mock Slack event payload
 */
export function createMockEventPayload(
  eventType: string,
  eventData: Record<string, any>,
  teamId = 'T123ABC456'
): SlackEventPayload {
  return {
    type: 'event_callback',
    team_id: teamId,
    api_app_id: 'A123ABC456',
    event: {
      type: eventType,
      user: 'U_USER_123',
      ts: `${Date.now() / 1000}.123456`,
      ...eventData,
    },
    event_id: 'Ev' + Math.random().toString(36).substring(2, 15),
    event_time: Math.floor(Date.now() / 1000),
  };
}

export interface SlackEventPayload {
  type: string;
  team_id: string;
  api_app_id: string;
  event: Record<string, any>;
  event_id: string;
  event_time: number;
}

/**
 * Create a mock Slack command payload
 */
export function createMockCommandPayload(
  command: string,
  text: string,
  overrides?: Partial<SlackCommandPayload>
): SlackCommandPayload {
  return {
    team_id: 'T123ABC456',
    team_domain: 'test-workspace',
    channel_id: 'C_CHANNEL_123',
    channel_name: 'general',
    user_id: 'U_USER_123',
    user_name: 'testuser',
    command,
    text,
    response_url: 'https://hooks.slack.com/commands/T123ABC456/123456/abcdef',
    trigger_id: 'trigger_' + Math.random().toString(36).substring(2, 15),
    ...overrides,
  };
}

export interface SlackCommandPayload {
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

/**
 * Create a mock Slack interactivity payload
 */
export function createMockInteractivityPayload(
  type: 'block_actions' | 'view_submission' | 'shortcut' | 'message_action',
  data: Record<string, any>,
  teamId = 'T123ABC456'
): SlackInteractivityPayload {
  const base = {
    type,
    team: { id: teamId, domain: 'test-workspace' },
    user: { id: 'U_USER_123', username: 'testuser', name: 'Test User' },
    api_app_id: 'A123ABC456',
    token: 'verification-token',
  };

  switch (type) {
    case 'block_actions':
      return {
        ...base,
        container: { type: 'message', message_ts: '1234567890.123456' },
        channel: { id: 'C_CHANNEL_123', name: 'general' },
        message: { ts: '1234567890.123456', text: 'Original message' },
        response_url: 'https://hooks.slack.com/actions/T123ABC456/123456/abcdef',
        actions: data.actions || [],
        ...data,
      };

    case 'view_submission':
      return {
        ...base,
        view: {
          id: 'V123ABC456',
          callback_id: data.callback_id || 'test_modal',
          state: data.state || { values: {} },
          ...data.view,
        },
        ...data,
      };

    case 'shortcut':
    case 'message_action':
      return {
        ...base,
        callback_id: data.callback_id || 'test_shortcut',
        trigger_id: 'trigger_' + Math.random().toString(36).substring(2, 15),
        channel: data.channel || { id: 'C_CHANNEL_123', name: 'general' },
        message: data.message,
        ...data,
      };

    default:
      return { ...base, ...data };
  }
}

export interface SlackInteractivityPayload {
  type: string;
  team: { id: string; domain: string };
  user: { id: string; username: string; name: string };
  api_app_id: string;
  token: string;
  [key: string]: any;
}

/**
 * Create a mock Slack API response
 */
export function createMockSlackApiResponse(
  ok: boolean,
  data?: Record<string, any>
): SlackApiResponse {
  if (ok) {
    return { ok: true, ...data };
  }
  return { ok: false, error: data?.error || 'unknown_error' };
}

export interface SlackApiResponse {
  ok: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * Create a mock OAuth token response
 */
export function createMockOAuthResponse(
  teamId = 'T123ABC456',
  teamName = 'Test Workspace'
): OAuthTokenResponse {
  return {
    ok: true,
    access_token: 'xoxb-' + Math.random().toString(36).substring(2, 20),
    token_type: 'bot',
    scope: 'chat:write,commands,app_mentions:read,im:history',
    bot_user_id: 'U' + Math.random().toString(36).substring(2, 11).toUpperCase(),
    app_id: 'A123ABC456',
    team: { id: teamId, name: teamName },
    authed_user: {
      id: 'U' + Math.random().toString(36).substring(2, 11).toUpperCase(),
    },
  };
}

export interface OAuthTokenResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id: string;
  app_id: string;
  team: { id: string; name: string };
  authed_user: { id: string };
}

/**
 * Create a valid state parameter for OAuth
 */
export function createOAuthState(userId: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return Buffer.from(`${userId}:${ts}`).toString('base64');
}

/**
 * Create an expired state parameter for OAuth
 */
export function createExpiredOAuthState(userId: string): string {
  const expiredTimestamp = Date.now() - 15 * 60 * 1000; // 15 minutes ago
  return Buffer.from(`${userId}:${expiredTimestamp}`).toString('base64');
}

/**
 * Mock Slack signature headers
 */
export function createSlackSignatureHeaders(
  body: string,
  signingSecret = 'test-signing-secret'
): Record<string, string> {
  const crypto = require('crypto');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const baseString = `v0:${timestamp}:${body}`;
  const signature =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');

  return {
    'x-slack-request-timestamp': timestamp,
    'x-slack-signature': signature,
  };
}

/**
 * Sample Slack events for testing
 */
export const sampleEvents = {
  appMention: (text = 'Hello Genie!', channel = 'C_CHANNEL_123') =>
    createMockEventPayload('app_mention', {
      text: `<@U_BOT_123> ${text}`,
      channel,
      thread_ts: undefined,
    }),

  directMessage: (text = 'Hello!', channel = 'D_DM_123') =>
    createMockEventPayload('message', {
      text,
      channel,
      channel_type: 'im',
    }),

  channelMessage: (text = 'Hello everyone!', channel = 'C_CHANNEL_123') =>
    createMockEventPayload('message', {
      text,
      channel,
      channel_type: 'channel',
    }),

  botMessage: (text = 'Bot response', botId = 'B_BOT_123') =>
    createMockEventPayload('message', {
      text,
      bot_id: botId,
      channel: 'C_CHANNEL_123',
    }),

  threadReply: (text = 'Thread reply', threadTs = '1234567890.000000') =>
    createMockEventPayload('message', {
      text,
      channel: 'C_CHANNEL_123',
      thread_ts: threadTs,
    }),
};

/**
 * Sample Slack commands for testing
 */
export const sampleCommands = {
  help: () => createMockCommandPayload('/genie', 'help'),
  ask: (question = 'What is AI?') => createMockCommandPayload('/genie', `ask ${question}`),
  code: (request = 'Write a hello world') => createMockCommandPayload('/genie', `code ${request}`),
  explain: (topic = 'machine learning') => createMockCommandPayload('/genie', `explain ${topic}`),
  summarize: (text = 'Long text to summarize') =>
    createMockCommandPayload('/genie', `summarize ${text}`),
  empty: () => createMockCommandPayload('/genie', ''),
};

/**
 * Sample Slack interactions for testing
 */
export const sampleInteractions = {
  feedbackHelpful: (value = 'original_question') =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'feedback_helpful', value }],
    }),

  feedbackNotHelpful: (value = 'original_question') =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'feedback_not_helpful', value }],
    }),

  regenerate: (value = 'What is AI?') =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'regenerate_response', value }],
    }),

  expand: (value = 'Topic to expand') =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'expand_response', value }],
    }),

  saveToMemory: (value = 'Content to save') =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'save_to_memory', value }],
    }),

  openSettings: () =>
    createMockInteractivityPayload('block_actions', {
      actions: [{ action_id: 'open_settings' }],
      trigger_id: 'trigger_123',
    }),

  settingsSubmission: (responseStyle = 'detailed', notifications = ['daily_summary']) =>
    createMockInteractivityPayload('view_submission', {
      callback_id: 'settings_modal',
      state: {
        values: {
          response_style: {
            response_style_select: { selected_option: { value: responseStyle } },
          },
          notifications: {
            notifications_checkboxes: {
              selected_options: notifications.map((n) => ({ value: n })),
            },
          },
        },
      },
    }),

  askGenieShortcut: () =>
    createMockInteractivityPayload('shortcut', {
      callback_id: 'ask_genie',
    }),

  summarizeMessageShortcut: (messageText = 'Long message to summarize') =>
    createMockInteractivityPayload('message_action', {
      callback_id: 'summarize_message',
      message: { text: messageText, ts: '1234567890.123456' },
    }),
};
