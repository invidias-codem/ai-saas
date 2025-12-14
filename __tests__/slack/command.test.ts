/**
 * Slack Command Handler Tests
 * Tests for the multi-tenant slash command handler
 */

// Mock NextResponse before importing the route
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data: any, init?: any) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(data),
    })),
  },
}));

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
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
import { POST, GET } from '@/app/api/integrations/slack/command/route';

describe('Slack Command Handler', () => {
  const mockSlackConfig = {
    teamId: 'T123ABC456',
    teamName: 'Test Workspace',
    botToken: 'xoxb-test-token-123',
    botUserId: 'U_BOT_123',
    scopes: ['chat:write', 'commands'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock for getSlackConfig
    const { getSlackConfig } = require('@/lib/slack/tokenManager');
    getSlackConfig.mockResolvedValue(mockSlackConfig);

    // Setup default mock for fetch (response_url)
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    // Set environment variables
    process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
    process.env.GOOGLE_API_KEY = 'test-google-api-key';
  });

  const createCommandRequest = (params: Record<string, string>) => {
    const body = new URLSearchParams({
      team_id: 'T123ABC456',
      team_domain: 'test-workspace',
      channel_id: 'C_CHANNEL_123',
      channel_name: 'general',
      user_id: 'U_USER_123',
      user_name: 'testuser',
      command: '/genie',
      response_url: 'https://hooks.slack.com/commands/test',
      ...params,
    }).toString();

    return new Request('http://localhost/api/integrations/slack/command', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-slack-signature': 'v0=test-signature',
      },
    });
  };

  describe('Help Command', () => {
    it('should return help message for /genie help', async () => {
      const request = createCommandRequest({ text: 'help' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response_type).toBe('ephemeral');
      expect(data.text).toContain('Loading help');
    });

    it('should return help message for empty command', async () => {
      const request = createCommandRequest({ text: '' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response_type).toBe('ephemeral');
    });
  });

  describe('Ask Command', () => {
    it('should process /genie ask with question', async () => {
      const request = createCommandRequest({ text: 'ask What is machine learning?' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toContain('Processing');

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify response_url was called
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/commands/test',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should return error for /genie ask without question', async () => {
      const request = createCommandRequest({ text: 'ask' });
      const response = await POST(request);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify error response was sent
      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/commands/test',
        expect.objectContaining({
          body: expect.stringContaining('Please provide a question'),
        })
      );
    });
  });

  describe('Code Command', () => {
    it('should process /genie code with request', async () => {
      const request = createCommandRequest({ text: 'code Write a Python hello world' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toContain('Processing');
    });

    it('should return error for /genie code without request', async () => {
      const request = createCommandRequest({ text: 'code' });
      await POST(request);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/commands/test',
        expect.objectContaining({
          body: expect.stringContaining('Please describe what code you need'),
        })
      );
    });
  });

  describe('Explain Command', () => {
    it('should process /genie explain with topic', async () => {
      const request = createCommandRequest({ text: 'explain How does blockchain work?' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toContain('Processing');
    });
  });

  describe('Summarize Command', () => {
    it('should process /genie summarize with text', async () => {
      const request = createCommandRequest({
        text: 'summarize This is a long text that needs to be summarized...',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toContain('Processing');
    });
  });

  describe('Unknown Commands', () => {
    it('should treat unknown commands as questions', async () => {
      const request = createCommandRequest({ text: 'random question here' });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toContain('Processing');
    });
  });

  describe('Multi-Tenant Support', () => {
    it('should fetch config for correct team', async () => {
      const { getSlackConfig } = require('@/lib/slack/tokenManager');

      const body = new URLSearchParams({
        team_id: 'T_SPECIFIC_TEAM',
        team_domain: 'specific-workspace',
        channel_id: 'C_CHANNEL_123',
        user_id: 'U_USER_123',
        command: '/genie',
        text: 'help',
        response_url: 'https://hooks.slack.com/commands/test',
      }).toString();

      const request = new Request('http://localhost/api/integrations/slack/command', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
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

      const body = new URLSearchParams({
        team_id: 'T_UNINSTALLED',
        channel_id: 'C_CHANNEL_123',
        user_id: 'U_USER_123',
        command: '/genie',
        text: 'help',
        response_url: 'https://hooks.slack.com/commands/test',
      }).toString();

      const request = new Request('http://localhost/api/integrations/slack/command', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.response_type).toBe('ephemeral');
      expect(data.text).toContain('not connected to Genie');
    });

    it('should return error for missing team_id', async () => {
      const body = new URLSearchParams({
        // No team_id
        channel_id: 'C_CHANNEL_123',
        user_id: 'U_USER_123',
        command: '/genie',
        text: 'help',
      }).toString();

      const request = new Request('http://localhost/api/integrations/slack/command', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.text).toContain('Missing team information');
    });
  });

  describe('Response Timing', () => {
    it('should respond within 3 seconds (immediate acknowledgment)', async () => {
      const startTime = Date.now();
      const request = createCommandRequest({ text: 'ask What is AI?' });
      await POST(request);
      const duration = Date.now() - startTime;

      // Should respond almost immediately (< 100ms for acknowledgment)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET Handler', () => {
    it('should return health check status', async () => {
      const request = new Request('http://localhost/api/integrations/slack/command', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('Slack Command endpoint active');
      expect(data.version).toBe('2.0.0');
    });
  });
});
