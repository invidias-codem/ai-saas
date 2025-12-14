/**
 * Slack Events API Tests
 * Tests for the multi-tenant events handler
 */

// Mock NextResponse before importing the route
jest.mock('next/server', () => {
  const MockNextResponse = jest.fn().mockImplementation((body: any, init?: any) => ({
    status: init?.status || 200,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    headers: new Map(Object.entries(init?.headers || {})),
  }));
  
  MockNextResponse.json = jest.fn((data: any, init?: any) => ({
    status: init?.status || 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }));
  
  return {
    NextResponse: MockNextResponse,
    NextRequest: jest.fn(),
  };
});

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  firestore: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
        set: jest.fn(),
      }),
    }),
  }),
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
      expect(data.version).toBe('2.0.0');
      expect(data.timestamp).toBeDefined();
    });
  });
});
