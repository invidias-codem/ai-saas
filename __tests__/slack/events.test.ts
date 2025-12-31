/**
 * Slack Events API Tests
 * Tests for the multi-tenant events handler
 */

// Mock NextResponse before importing the route
// Mock NextResponse before importing the route
jest.mock('next/server', () => {
  // Define a simple mock class-like structure with static json method
  const StaticNextResponse = {
    json: (data: any, init?: any) => ({
      status: init?.status || 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    })
  };

  // The default export or named export needs to be callable as new NextResponse()
  // But our code might also use NextResponse.json()

  return {
    NextResponse: Object.assign(
      jest.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        text: async () => body,
        json: async () => typeof body === 'string' ? JSON.parse(body) : body,
        headers: new Map(Object.entries(init?.headers || {})),
      })),
      StaticNextResponse
    ),
    NextRequest: jest.fn(),
  };
});

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
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
    scopes: ['chat:write', 'app_mentions:read'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock for getSlackConfig
    const { getSlackConfig } = require('@/lib/slack/tokenManager');
    getSlackConfig.mockResolvedValue(mockSlackConfig);

    // Setup default mock for fetch (Slack API)
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    // Set environment variables
    process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
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
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
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
            return null;
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
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
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
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
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
          'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
          'x-slack-signature': 'v0=test-signature',
        },
      });

      // Should not throw, should return ok
      const response = await POST(request);
      expect(response.status).toBe(200);
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
