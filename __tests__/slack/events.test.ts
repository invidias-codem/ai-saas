/**
 * Slack Events API Tests
 * Tests for the multi-tenant events handler
 */

// NextResponse is mocked globally in jest.setup.js

// Mock the shared Slack verification to always pass in tests
jest.mock('@/lib/slack/slackVerification', () => ({
  requireSlackSignature: jest.fn().mockReturnValue(null),
  verifySlackSignature: jest.fn().mockReturnValue({ valid: true }),
}));

// Mock the shared Slack telemetry
jest.mock('@/lib/slack/slackTelemetry', () => ({
  emitSlackTelemetry: jest.fn(),
  extractTelemetryFields: jest.fn().mockReturnValue({
    teamId: 'T123ABC456',
    eventType: 'event_callback',
    channelId: 'C_CHANNEL_123',
    threadTs: '1234567890.123',
    userId: 'U_USER_123'
  }),
}));

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
}));

// Mock user resolution and workspace access
jest.mock('@/lib/slack/userResolver', () => ({
  resolveSlackUser: jest.fn().mockResolvedValue('U_INTERNAL_123'),
}));

jest.mock('@/lib/security/workspaceAccess', () => ({
  getWorkspaceAccess: jest.fn().mockResolvedValue({
    workspaceId: 'WS_123',
    userId: 'U_INTERNAL_123',
    role: 'member',
    permissions: ['workspace:read', 'memory:read'],
    source: 'workspace_members',
  }),
}));

// Mock Firebase Admin
// Mock @/lib/firebaseAdmin to bypass initialization
jest.mock('@/lib/firebaseAdmin', () => ({
  db: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        collection: jest.fn().mockReturnValue({ // Nested collection for memories
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue({
                empty: true,
                docs: []
              })
            })
          }),
          add: jest.fn(),
        }),
      }),
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            empty: true,
            docs: []
          })
        })
      }),
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ docs: [] })
      }),
      add: jest.fn(),
    }),
  },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(),
        arrayUnion: jest.fn(),
      }
    }
  }
}));

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({
          response: {
            text: () => 'This is a test response from Genie.',
          },
        }),
        sendMessageStream: jest.fn().mockResolvedValue({
          stream: (async function* () {
            yield { text: () => 'This is a ' };
            yield { text: () => 'streamed response.' };
          })(),
          response: Promise.resolve({
            text: () => 'This is a streamed response.',
          }),
        }),
      }),
    }),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

// Mock fetch for Slack API calls
global.fetch = jest.fn();

// Import after mocks
import { POST, GET } from '@/app/api/integrations/slack/events/route';

describe('Slack Events API', () => {
  const mockSlackConfig = {
    teamId: 'T123ABC456',
    teamName: 'Test Workspace',
    botToken: 'xoxb-test-token-123',
    botUserId: 'U_BOT_123',
    workspaceId: 'WS_123',
    workspacePath: '/workspace/123',
    scopes: ['chat:write', 'app_mentions:read'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const { getSlackConfig } = require('@/lib/slack/tokenManager');
    getSlackConfig.mockResolvedValue(mockSlackConfig);

    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    process.env.GOOGLE_API_KEY = 'test-google-api-key';
  });

  describe('URL Verification', () => {
    it('should respond to URL verification challenge', async () => {
      const challengePayload = {
        type: 'url_verification',
        challenge: 'test-challenge-string',
      };

      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(challengePayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe('test-challenge-string');
    });
  });

  describe('Event Handling', () => {
    const createEventRequest = (event: any, teamId = 'T123ABC456') => {
      const payload = {
        type: 'event_callback',
        team_id: teamId,
        event,
      };

      return new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    };

    it('should handle app_mention event', async () => {
      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> What is AI?',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('should handle direct message event', async () => {
      const event = {
        type: 'message',
        channel_type: 'im',
        user: 'U_USER_123',
        text: 'Hello Genie!',
        channel: 'D_DM_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('should ignore bot own messages', async () => {
      const event = {
        type: 'message',
        user: 'U_BOT_123', // Same as botUserId
        text: 'Bot message',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      // Should not call Slack API to send message
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('chat.postMessage'),
        expect.anything()
      );
    });

    it('should ignore messages with bot_id', async () => {
      const event = {
        type: 'message',
        user: 'U_OTHER_BOT',
        bot_id: 'B_BOT_123',
        text: 'Another bot message',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    it('should handle app_home_opened event', async () => {
      const event = {
        type: 'app_home_opened',
        user: 'U_USER_123',
        tab: 'home',
        channel: 'C_HOME',
        event_ts: '1234567890.123456',
        team_id: 'T123ABC456',
      };

      const request = createEventRequest(event);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);

      // Wait for async background processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify views.publish was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('views.publish'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"type":"home"'),
        })
      );
    });

    it('should handle file_shared event', async () => {
      // Create request with file_shared event
      const req = {
        text: () => Promise.resolve(JSON.stringify({
          token: 'verification_token',
          team_id: 'T_TEAM_123',
          api_app_id: 'A_APP_123',
          event: {
            type: 'file_shared',
            user: 'U_USER_123',
            file_id: 'F_FILE_123',
            user_id: 'U_USER_123',
            channel_id: 'C_CHANNEL_123',
            event_ts: '1234567890.123456',
          },
          type: 'event_callback',
          event_id: 'Ev12345',
          event_time: 1234567890,
        })),
        headers: {
          get: (key: string) => {
            if (key === 'x-slack-request-timestamp') return Math.floor(Date.now() / 1000).toString();
            if (key === 'x-slack-signature') return 'v0=mock_signature';
            if (key === 'x-slack-retry-num') return null;
            if (key === 'x-slack-retry-reason') return null;
            return null;
          },
          has: (key: string) => {
            return key === 'x-slack-request-timestamp' || key === 'x-slack-signature';
          },
        },
      } as any;

      // Mock specific fetch responses for file handling
      (global.fetch as jest.Mock).mockImplementation((url, options) => {
        // Handle files.info
        if (url && url.toString().includes('files.info')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              ok: true,
              file: {
                id: 'F_FILE_123',
                name: 'test.py',
                filetype: 'python',
                mimetype: 'text/x-python',
                url_private: 'https://files.slack.com/test.py',
                shares: { public: { 'C_CHANNEL_123': [{ ts: '1234567890.123456' }] } }
              }
            })
          });
        }
        // Handle file download
        if (url === 'https://files.slack.com/test.py') {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('print("Hello World")')
          });
        }
        // Handle chat.postMessage
        if (url && url.toString().includes('chat.postMessage')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, ts: '1234567891.000000' }) });
        }
        // Handle reactions.add
        if (url && url.toString().includes('reactions.add')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
        }
        // Default catch-all (views.publish etc)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      });

      const response = await POST(req);
      const data = await response.text();
      // POST returns NextResponse, we check status

      expect(response.status).toBe(200);

      // Wait for async background processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if files.info was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('files.info'),
        expect.anything()
      );

      // Check if file content was downloaded
      expect(global.fetch).toHaveBeenCalledWith(
        'https://files.slack.com/test.py',
        expect.anything()
      );

      // Check if analysis was posted
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('chat.postMessage'),
        expect.objectContaining({
          body: expect.stringContaining('File Analysis: test.py')
        })
      );
    });
  });

  describe('Multi-Tenant Support', () => {
    it('should fetch config for correct team', async () => {
      const { getSlackConfig } = require('@/lib/slack/tokenManager');

      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'event_callback',
          team_id: 'T_SPECIFIC_TEAM',
          event,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await POST(request);

      expect(getSlackConfig).toHaveBeenCalledWith('T_SPECIFIC_TEAM');
    });

    it('should return error for uninstalled workspace', async () => {
      const { getSlackConfig } = require('@/lib/slack/tokenManager');
      getSlackConfig.mockRejectedValue(new Error('No installation found'));

      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'event_callback',
          team_id: 'T_UNINSTALLED',
          event,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error).toBe('workspace_not_installed');
    });

    it('should return error for missing team_id', async () => {
      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'event_callback',
          // No team_id
          event: { type: 'app_mention' },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle Slack API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
      });

      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_INVALID',
        ts: '1234567890.123456',
      };

      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify({
          type: 'event_callback',
          team_id: 'T123ABC456',
          event,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not throw, should return ok
      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });

  describe('Retry & Idempotency', () => {
    const createEventRequest = (event: any, teamId = 'T123ABC456', headers: Record<string, string> = {}, topLevelFields: Record<string, any> = {}) => {
      const payload = {
        type: 'event_callback',
        team_id: teamId,
        event,
        ...topLevelFields,
      };

      return new Request('http://localhost/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
          ...headers,
        },
      });
    };

    it('should log retry_received telemetry for retried events (not short-circuit)', async () => {
      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event, 'T123ABC456', {
        'x-slack-retry-num': '1',
        'x-slack-retry-reason': 'http_timeout',
      }, { event_id: 'EvSame123', event_time: 1234567890 });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify slack_retry_received was emitted (not slack_retry_ignored)
      const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
      const retryCalls = (emitSlackTelemetry as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.type === 'slack_retry_received'
      );
      expect(retryCalls.length).toBe(1);
      expect(retryCalls[0][0].metadata).toMatchObject({
        retryNum: '1',
        retryReason: 'http_timeout',
        eventId: 'EvSame123',
      });
    });

    it('should process duplicate event_id as separate request in S1 (S2 adds deduplication)', async () => {
      // S1 does NOT deduplicate - it processes each request
      // S2 will add Supabase-based idempotency using event_id
      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      // First request
      const request1 = createEventRequest(event, 'T123ABC456', {}, { event_id: 'EvDuplicate123', event_time: 1234567890 });
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second request with same event_id (simulating duplicate delivery)
      const request2 = createEventRequest(event, 'T123ABC456', {}, { event_id: 'EvDuplicate123', event_time: 1234567890 });
      const response2 = await POST(request2);
      expect(response2.status).toBe(200);

      // Both should be processed (S1 behavior - S2 will deduplicate)
      const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
      const receivedCalls = (emitSlackTelemetry as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.type === 'slack_event_received'
      );
      expect(receivedCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should not short-circuit on retry and continue to handler', async () => {
      const event = {
        type: 'app_mention',
        user: 'U_USER_123',
        text: '<@U_BOT_123> Hello',
        channel: 'C_CHANNEL_123',
        ts: '1234567890.123456',
      };

      const request = createEventRequest(event, 'T123ABC456', {
        'x-slack-retry-num': '1',
        'x-slack-retry-reason': 'http_error',
      }, { event_id: 'EvRetryContinue', event_time: 1234567890 });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify slack_retry_received was emitted (proving retry was not short-circuited)
      const { emitSlackTelemetry } = require('@/lib/slack/slackTelemetry');
      const retryCalls = (emitSlackTelemetry as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0]?.type === 'slack_retry_received'
      );
      expect(retryCalls.length).toBe(1);
      expect(retryCalls[0][0].metadata.retryNum).toBe('1');
    });
  });

  describe('GET Handler', () => {
    it('should return health check status', async () => {
      const request = new Request('http://localhost/api/integrations/slack/events', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('Slack Events API endpoint active');
      expect(data.version).toBe('3.2.0');
      expect(data.timestamp).toBeDefined();
    });
  });
});
