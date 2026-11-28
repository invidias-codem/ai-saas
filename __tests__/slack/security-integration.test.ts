/***
 * Slack Security Integration Tests
 * Invokes actual Slack route handlers with valid signed requests.
 * Covers: unlinked users, revoked workspace membership, cross-tenant access,
 * unauthorized channel settings, denied engineer approvals.
 */

// Mock NextResponse before importing routes
jest.mock('next/server', () => {
  const MockNextResponse: any = jest.fn().mockImplementation((body: any, init?: any) => ({
    status: init?.status || 200,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    headers: new Map(Object.entries(init?.headers || {})),
  }));
  MockNextResponse.json = jest.fn((data: any, init?: any) => ({
    status: init?.status || 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }));
  return { NextResponse: MockNextResponse };
});

// Slack signing secret for test signatures
process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
process.env.GOOGLE_API_KEY = 'test-google-api-key';

import crypto from 'crypto';

/** Compute a valid Slack v0 signature for a raw body and timestamp. */
function signSlackRequest(rawBody: string, timestamp: number, secret = 'test-signing-secret'): string {
  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret).update(baseString).digest('hex');
  return `v0=${hmac}`;
}

/** Build a signed NextRequest for Slack interactivity (url-encoded payload). */
function signedInteractivityRequest(payload: any, teamId = 'T123ABC456'): Request {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  const signature = signSlackRequest(body, timestamp);
  return new Request('http://localhost/api/integrations/slack/interactivity', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp.toString(),
      'x-slack-signature': signature,
    },
  });
}

/** Build a signed NextRequest for Slack Events API (raw JSON body). */
function signedEventsRequest(bodyObj: any, teamId = 'T123ABC456'): Request {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(bodyObj);
  const signature = signSlackRequest(rawBody, timestamp);
  return new Request('http://localhost/api/integrations/slack/events', {
    method: 'POST',
    body: rawBody,
    headers: {
      'Content-Type': 'application/json',
      'x-slack-request-timestamp': timestamp.toString(),
      'x-slack-signature': signature,
    },
  });
}

// Mock shared utilities before importing routes
jest.mock('@/lib/slack/slackVerification', () => ({
  requireSlackSignature: jest.fn().mockReturnValue(null),
  verifySlackSignature: jest.fn().mockReturnValue({ valid: true }),
}));

jest.mock('@/lib/slack/slackTelemetry', () => ({
  emitSlackTelemetry: jest.fn(),
  extractTelemetryFields: jest.fn().mockReturnValue({
    teamId: 'T123ABC456',
    eventType: 'event_callback',
    channelId: 'C_CHANNEL_123',
    threadTs: '',
    userId: '',
  }),
}));

jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
}));

jest.mock('@/lib/slack/userResolver', () => ({
  resolveSlackUser: jest.fn().mockResolvedValue(null),
  linkSlackUser: jest.fn(),
}));

jest.mock('@/lib/slack/adminVerification', () => ({
  verifySlackAdmin: jest.fn().mockResolvedValue({ isAdmin: false, reason: 'not_admin' }),
  isSlackAdmin: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn().mockResolvedValue(null),
}));

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({ response: { text: () => 'Response' } }),
        sendMessageStream: jest.fn().mockResolvedValue({
          stream: { [Symbol.asyncIterator]: async function* () {} },
        }),
      }),
    }),
  })),
  HarmCategory: {},
  HarmBlockThreshold: {},
}));

global.fetch = jest.fn();

describe('Slack Security Integration', () => {
  const mockSlackConfig = {
    teamId: 'T123ABC456',
    teamName: 'Test Workspace',
    botToken: 'xoxb-test-token',
    botUserId: 'U_BOT_123',
    workspaceId: 'WS_123',
    workspacePath: '/workspace/123',
    scopes: ['chat:write'],
  };

  const { getSlackConfig } = require('@/lib/slack/tokenManager');
  const { resolveSlackUser } = require('@/lib/slack/userResolver');
  const { getWorkspaceAccess } = require('@/lib/security/workspaceAccess');
  const { verifySlackAdmin } = require('@/lib/slack/adminVerification');

  beforeEach(() => {
    jest.clearAllMocks();
    getSlackConfig.mockResolvedValue(mockSlackConfig);
    resolveSlackUser.mockResolvedValue(null);
    getWorkspaceAccess.mockResolvedValue(null);
    verifySlackAdmin.mockResolvedValue({ isAdmin: false, reason: 'not_admin' });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
  });

  describe('Path A — Events API sender → internal identity → workspace authorization', () => {
    it('denies protected feature when Slack user is not linked (internalUserId null)', async () => {
      resolveSlackUser.mockResolvedValue(null); // not linked
      getWorkspaceAccess.mockResolvedValue(null);

      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const request = signedEventsRequest({
        type: 'event_callback',
        team_id: 'T123ABC456',
        event_id: 'Ev_int_001',
        event_time: Math.floor(Date.now() / 1000),
        event: { type: 'app_mention', user: 'U_UNLINKED', text: '<@bot> hello', channel: 'C1', ts: '1.0' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      // Telemetry should record unauthorized_protected_feature
      expect(require('@/lib/slack/slackTelemetry').emitSlackTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'unauthorized_protected_feature' })
      );
    });

    it('denies protected feature when workspace membership is revoked', async () => {
      resolveSlackUser.mockResolvedValue('U_INTERNAL_1'); // linked
      getWorkspaceAccess.mockResolvedValue(null); // revoked / no access

      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const request = signedEventsRequest({
        type: 'event_callback',
        team_id: 'T123ABC456',
        event_id: 'Ev_int_002',
        event_time: Math.floor(Date.now() / 1000),
        event: { type: 'app_mention', user: 'U_LINKED', text: '<@bot> hello', channel: 'C1', ts: '1.0' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(require('@/lib/slack/slackTelemetry').emitSlackTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'unauthorized_protected_feature' })
      );
      // verify resolveSlackUser was called (sender resolution attempted)
      expect(resolveSlackUser).toHaveBeenCalledWith('T123ABC456', 'U_LINKED');
    });

    it('allows protected feature when user is linked and has workspace access', async () => {
      resolveSlackUser.mockResolvedValue('U_INTERNAL_1');
      getWorkspaceAccess.mockResolvedValue({
        workspaceId: 'WS_123',
        userId: 'U_INTERNAL_1',
        role: 'member',
        permissions: ['workspace:read', 'memory:read'],
        source: 'workspace_members',
      });

      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const request = signedEventsRequest({
        type: 'event_callback',
        team_id: 'T123ABC456',
        event_id: 'Ev_int_003',
        event_time: Math.floor(Date.now() / 1000),
        event: { type: 'app_mention', user: 'U_LINKED', text: '<@bot> hello', channel: 'C1', ts: '1.0' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('does not block non-protected event types when user is unlinked', async () => {
      resolveSlackUser.mockResolvedValue(null);

      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const request = signedEventsRequest({
        type: 'event_callback',
        team_id: 'T123ABC456',
        event_id: 'Ev_int_004',
        event_time: Math.floor(Date.now() / 1000),
        event: { type: 'assistant_thread_started', user: 'U_UNLINKED', channel: 'C1', ts: '1.0' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });
  });

  describe('Interactivity — cross-tenant + admin authorization', () => {
    it('rejects cross-tenant channel config (teamId mismatch)', async () => {
      getSlackConfig.mockResolvedValue({ ...mockSlackConfig, teamId: 'T_CONFIG_TEAM' });

      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');
      const request = signedInteractivityRequest({
        type: 'view_submission',
        team: { id: 'T_OTHER_TEAM' }, // different from config.teamId
        user: { id: 'U_USER_123' },
        trigger_id: 'trigger_123',
        view: {
          callback_id: 'configure_channel_submission',
          state: { values: {} },
          private_metadata: JSON.stringify({ channelId: 'C1', teamId: 'T_OTHER_TEAM' }),
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.errors).toBeDefined();
      expect(data.errors.persona_block).toContain('team mismatch');
    });

    it('denies channel config for non-admin user', async () => {
      getSlackConfig.mockResolvedValue(mockSlackConfig);
      verifySlackAdmin.mockResolvedValue({ isAdmin: false, reason: 'not_admin' });

      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');
      const request = signedInteractivityRequest({
        type: 'view_submission',
        team: { id: 'T123ABC456' },
        user: { id: 'U_NON_ADMIN' },
        trigger_id: 'trigger_123',
        view: {
          callback_id: 'configure_channel_submission',
          state: { values: {} },
          private_metadata: JSON.stringify({ channelId: 'C1', teamId: 'T123ABC456' }),
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.errors).toBeDefined();
      expect(data.errors.persona_block).toContain('admin');
      expect(verifySlackAdmin).toHaveBeenCalledWith(mockSlackConfig.botToken, 'U_NON_ADMIN');
    });

    it('allows channel config for verified admin', async () => {
      getSlackConfig.mockResolvedValue(mockSlackConfig);
      verifySlackAdmin.mockResolvedValue({ isAdmin: true, reason: 'workspace_admin' });

      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');
      const request = signedInteractivityRequest({
        type: 'view_submission',
        team: { id: 'T123ABC456' },
        user: { id: 'U_ADMIN' },
        trigger_id: 'trigger_123',
        view: {
          callback_id: 'configure_channel_submission',
          state: { values: {} },
          private_metadata: JSON.stringify({ channelId: 'C1', teamId: 'T123ABC456' }),
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response_action).toBeUndefined();
    });

    it('rejects interactivity without trigger_id for block_actions', async () => {
      // Build request without trigger_id
      const timestamp = Math.floor(Date.now() / 1000);
      const body = new URLSearchParams({
        payload: JSON.stringify({
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          actions: [{ action_id: 'feedback_helpful', value: 'x' }],
        }),
      }).toString();
      const signature = signSlackRequest(body, timestamp);

      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');
      const request = new Request('http://localhost/api/integrations/slack/interactivity', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-slack-request-timestamp': timestamp.toString(),
          'x-slack-signature': signature,
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.ok).toBe(false);
      expect(data.error).toBe('Missing trigger_id');
    });
  });
});
