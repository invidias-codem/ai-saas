/**
 * Slack Interactivity Handler Tests
 * Tests for button clicks, modals, and shortcuts
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
  };
});

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists: true }),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockDocRef),
    add: jest.fn().mockResolvedValue({ id: 'doc_123' }),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue(mockCollection),
    }),
  };
});

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'Regenerated response from Genie.',
        },
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
import { POST, GET } from '@/app/api/integrations/slack/interactivity/route';

describe('Slack Interactivity Handler', () => {
  const mockSlackConfig = {
    teamId: 'T123ABC456',
    teamName: 'Test Workspace',
    botToken: 'xoxb-test-token-123',
    botUserId: 'U_BOT_123',
    scopes: ['chat:write'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock for getSlackConfig
    const { getSlackConfig } = require('@/lib/slack/tokenManager');
    getSlackConfig.mockResolvedValue(mockSlackConfig);

    // Setup default mock for fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    // Set environment variables
    process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
    process.env.GOOGLE_API_KEY = 'test-google-api-key';
  });

  const createInteractivityRequest = (payload: any) => {
    const body = new URLSearchParams({
      payload: JSON.stringify(payload),
    }).toString();

    return new Request('http://localhost/api/integrations/slack/interactivity', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-slack-signature': 'v0=test-signature',
      },
    });
  };

  describe('Block Actions', () => {
    describe('Feedback Actions', () => {
      it('should handle feedback_helpful action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          channel: { id: 'C_CHANNEL_123' },
          message: { ts: '1234567890.123456', text: 'Original message' },
          response_url: 'https://hooks.slack.com/actions/test',
          actions: [
            {
              action_id: 'feedback_helpful',
              value: 'original_question',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.ok).toBe(true);

        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify feedback was stored
        const admin = require('firebase-admin');
        expect(admin.firestore().collection).toHaveBeenCalledWith('slackFeedback');
      });

      it('should handle feedback_not_helpful action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          message: { ts: '1234567890.123456' },
          response_url: 'https://hooks.slack.com/actions/test',
          actions: [
            {
              action_id: 'feedback_not_helpful',
              value: 'original_question',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);

        expect(response.status).toBe(200);
      });
    });

    describe('Regenerate Action', () => {
      it('should handle regenerate_response action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          response_url: 'https://hooks.slack.com/actions/test',
          actions: [
            {
              action_id: 'regenerate_response',
              value: 'What is AI?',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);

        expect(response.status).toBe(200);

        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Verify response_url was called multiple times (loading + final)
        expect(global.fetch).toHaveBeenCalledWith(
          'https://hooks.slack.com/actions/test',
          expect.anything()
        );
      });
    });

    describe('Expand Action', () => {
      it('should handle expand_response action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          message: { blocks: [] },
          response_url: 'https://hooks.slack.com/actions/test',
          actions: [
            {
              action_id: 'expand_response',
              value: 'Topic to expand',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);

        expect(response.status).toBe(200);
      });
    });

    describe('Save to Memory Action', () => {
      it('should handle save_to_memory action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          channel: { id: 'C_CHANNEL_123' },
          message: { ts: '1234567890.123456' },
          response_url: 'https://hooks.slack.com/actions/test',
          actions: [
            {
              action_id: 'save_to_memory',
              value: 'Content to save',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);

        expect(response.status).toBe(200);

        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify memory was stored
        const admin = require('firebase-admin');
        expect(admin.firestore().collection).toHaveBeenCalledWith('slackMemories');
      });
    });

    describe('Open Settings Action', () => {
      it('should handle open_settings action', async () => {
        const payload = {
          type: 'block_actions',
          team: { id: 'T123ABC456' },
          user: { id: 'U_USER_123' },
          trigger_id: 'trigger_123',
          actions: [
            {
              action_id: 'open_settings',
            },
          ],
        };

        const request = createInteractivityRequest(payload);
        const response = await POST(request);

        expect(response.status).toBe(200);

        // Wait for async processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify modal was opened
        expect(global.fetch).toHaveBeenCalledWith(
          'https://slack.com/api/views.open',
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });
  });

  describe('View Submissions', () => {
    it('should handle settings_modal submission', async () => {
      const payload = {
        type: 'view_submission',
        team: { id: 'T123ABC456' },
        user: { id: 'U_USER_123' },
        view: {
          callback_id: 'settings_modal',
          state: {
            values: {
              response_style: {
                response_style_select: {
                  selected_option: { value: 'detailed' },
                },
              },
              notifications: {
                notifications_checkboxes: {
                  selected_options: [{ value: 'daily_summary' }],
                },
              },
            },
          },
        },
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Empty response closes the modal
      expect(Object.keys(data)).toHaveLength(0);

      // Verify preferences were stored
      const admin = require('firebase-admin');
      expect(admin.firestore().collection).toHaveBeenCalledWith('slackUserPreferences');
    });

    it('should return errors for failed submission', async () => {
      const admin = require('firebase-admin');
      admin.firestore().collection().doc().set.mockRejectedValue(new Error('DB Error'));

      const payload = {
        type: 'view_submission',
        team: { id: 'T123ABC456' },
        user: { id: 'U_USER_123' },
        view: {
          callback_id: 'settings_modal',
          state: { values: {} },
        },
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(data.response_action).toBe('errors');
      expect(data.errors).toBeDefined();
    });
  });

  describe('Shortcuts', () => {
    it('should handle ask_genie shortcut', async () => {
      const payload = {
        type: 'shortcut',
        callback_id: 'ask_genie',
        team: { id: 'T123ABC456' },
        user: { id: 'U_USER_123' },
        trigger_id: 'trigger_123',
        channel: { id: 'C_CHANNEL_123' },
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify modal was opened
      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.com/api/views.open',
        expect.anything()
      );
    });

    it('should handle summarize_message shortcut', async () => {
      const payload = {
        type: 'message_action',
        callback_id: 'summarize_message',
        team: { id: 'T123ABC456' },
        user: { id: 'U_USER_123' },
        channel: { id: 'C_CHANNEL_123' },
        message: {
          text: 'This is a long message that needs to be summarized.',
          ts: '1234567890.123456',
        },
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify message was sent
      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.anything()
      );
    });
  });

  describe('Multi-Tenant Support', () => {
    it('should fetch config for correct team', async () => {
      const { getSlackConfig } = require('@/lib/slack/tokenManager');

      const payload = {
        type: 'block_actions',
        team: { id: 'T_SPECIFIC_TEAM' },
        user: { id: 'U_USER_123' },
        actions: [{ action_id: 'feedback_helpful', value: 'test' }],
      };

      const request = createInteractivityRequest(payload);
      await POST(request);

      expect(getSlackConfig).toHaveBeenCalledWith('T_SPECIFIC_TEAM');
    });

    it('should return error for uninstalled workspace', async () => {
      const { getSlackConfig } = require('@/lib/slack/tokenManager');
      getSlackConfig.mockRejectedValue(new Error('No installation found'));

      const payload = {
        type: 'block_actions',
        team: { id: 'T_UNINSTALLED' },
        user: { id: 'U_USER_123' },
        actions: [{ action_id: 'feedback_helpful', value: 'test' }],
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(data.error).toBe('workspace_not_installed');
    });

    it('should return error for missing team_id', async () => {
      const payload = {
        type: 'block_actions',
        // No team
        user: { id: 'U_USER_123' },
        actions: [{ action_id: 'feedback_helpful', value: 'test' }],
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);
      const data = await response.json();

      expect(data.ok).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing payload', async () => {
      const request = new Request('http://localhost/api/integrations/slack/interactivity', {
        method: 'POST',
        body: '',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should handle invalid JSON payload', async () => {
      const body = new URLSearchParams({
        payload: 'invalid json',
      }).toString();

      const request = new Request('http://localhost/api/integrations/slack/interactivity', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);

      // Should return 200 with error in body (Slack expects 200)
      expect(response.status).toBe(200);
    });

    it('should handle unknown action gracefully', async () => {
      const payload = {
        type: 'block_actions',
        team: { id: 'T123ABC456' },
        user: { id: 'U_USER_123' },
        actions: [{ action_id: 'unknown_action', value: 'test' }],
      };

      const request = createInteractivityRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('GET Handler', () => {
    it('should return health check status', async () => {
      const request = new Request('http://localhost/api/integrations/slack/interactivity', {
        method: 'GET',
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('Slack Interactivity endpoint active');
      expect(data.version).toBe('2.0.0');
    });
  });
});
