/**
 * Slack Integration Tests
 * End-to-end tests for the complete Slack integration flow
 */

// NextResponse is mocked globally in jest.setup.js

// Mock all external dependencies
jest.mock('@/lib/slack/tokenManager', () => ({
  getSlackConfig: jest.fn(),
  saveSlackInstallation: jest.fn(),
  removeSlackInstallation: jest.fn(),
  hasInstallation: jest.fn(),
  logInstallationEvent: jest.fn(),
}));

jest.mock('firebase-admin', () => {
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockDocRef),
    add: jest.fn().mockResolvedValue({ id: 'doc_123' }),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue(mockCollection),
    }),
  };
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({
          response: { text: () => 'AI response from Genie' },
        }),
        sendMessageStream: jest.fn().mockResolvedValue({
          stream: (async function*() {
            yield { text: () => 'This is a ' };
            yield { text: () => 'streamed response.' };
          })(),
          response: Promise.resolve({
            text: () => 'This is a streamed response.',
          }),
        }),
      }),
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'Generated content from Genie' },
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

global.fetch = jest.fn();

// Import test helpers after mocks
import {
  createMockInstallation,
  createMockOAuthResponse,
  createOAuthState,
  sampleEvents,
  sampleCommands,
  sampleInteractions,
  createSlackSignatureHeaders,
} from './testHelpers';

describe('Slack Integration - End to End', () => {
  const mockInstallation = createMockInstallation();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup token manager mocks
    const tokenManager = require('@/lib/slack/tokenManager');
    tokenManager.getSlackConfig.mockResolvedValue({
      teamId: mockInstallation.teamId,
      teamName: mockInstallation.teamName,
      botToken: mockInstallation.botToken,
      botUserId: mockInstallation.botUserId,
      scopes: mockInstallation.scopes,
    });
    tokenManager.saveSlackInstallation.mockResolvedValue(undefined);
    tokenManager.hasInstallation.mockResolvedValue(false);
    tokenManager.logInstallationEvent.mockResolvedValue(undefined);

    // Setup fetch mock
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    // Setup environment
    process.env.SLACK_CLIENT_ID = 'test-client-id';
    process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
    // Keep unset so route signature verification does not block unit tests.
    delete process.env.SLACK_SIGNING_SECRET;
    process.env.GOOGLE_API_KEY = 'test-google-api-key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });

  describe('Complete Installation Flow', () => {
    it('should complete OAuth flow and store installation', async () => {
      const { GET } = await import('@/app/api/integrations/slack/callback/route');
      const tokenManager = require('@/lib/slack/tokenManager');

      // Mock OAuth token response
      const oauthResponse = createMockOAuthResponse(mockInstallation.teamId, mockInstallation.teamName);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: () => Promise.resolve(oauthResponse),
      });

      // Create OAuth callback request
      const state = createOAuthState('user_123');
      const request = new Request(
        `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
        { method: 'GET' }
      ) as unknown as import('next/server').NextRequest;

      const response = await GET(request);

      // Verify redirect to success
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('slack_success=true');

      // Verify installation was saved (current implementation persists via Supabase RPC)
      const { supabaseAdmin } = require('@/lib/supabaseClient');
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
        'upsert_slack_integration',
        expect.objectContaining({
          p_slack_team_id: mockInstallation.teamId,
          p_slack_team_name: mockInstallation.teamName,
        })
      );
    });
  });

  describe('Event Processing Flow', () => {
    it('should process app_mention and respond', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');

      const eventPayload = sampleEvents.appMention('What is machine learning?');
      eventPayload.team_id = mockInstallation.teamId;

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(eventPayload),
        headers: {
          'Content-Type': 'application/json',
          ...createSlackSignatureHeaders(JSON.stringify(eventPayload)),
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify Slack API was called to send message
      expect(global.fetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.anything()
      );
    });

    it('should process DM and respond', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');

      const eventPayload = sampleEvents.directMessage('Hello Genie!');
      eventPayload.team_id = mockInstallation.teamId;

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(eventPayload),
        headers: {
          'Content-Type': 'application/json',
          ...createSlackSignatureHeaders(JSON.stringify(eventPayload)),
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it('should ignore bot messages to prevent loops', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');

      const eventPayload = sampleEvents.botMessage('Bot response');
      eventPayload.team_id = mockInstallation.teamId;

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(eventPayload),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Should NOT call chat.postMessage
      expect(global.fetch).not.toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.anything()
      );
    });
  });

  describe('Command Processing Flow', () => {
    it('should process /genie ask command', async () => {
      const { POST } = await import('@/app/api/integrations/slack/command/route');

      const commandPayload = sampleCommands.ask('What is AI?');
      commandPayload.team_id = mockInstallation.teamId;

      const body = new URLSearchParams(commandPayload as any).toString();

      const request = new Request('https://app.example.com/api/integrations/slack/command', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...createSlackSignatureHeaders(body),
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Copy is intentionally flexible (e.g. "*Thinking...*", "*Analyzing...*", "*Processing your request...*")
      expect(data.text).toMatch(/thinking|analyzing|processing|working on it/i);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify response_url was called
      expect(global.fetch).toHaveBeenCalledWith(
        commandPayload.response_url,
        expect.anything()
      );
    });

    it('should return help for /genie help', async () => {
      const { POST } = await import('@/app/api/integrations/slack/command/route');

      const commandPayload = sampleCommands.help();
      commandPayload.team_id = mockInstallation.teamId;

      const body = new URLSearchParams(commandPayload as any).toString();

      const request = new Request('https://app.example.com/api/integrations/slack/command', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.response_type).toBe('ephemeral');
    });
  });

  describe('Interactivity Flow', () => {
    it('should handle feedback button click', async () => {
      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');

      const interactionPayload = sampleInteractions.feedbackHelpful('What is AI?');
      interactionPayload.team.id = mockInstallation.teamId;

      const body = new URLSearchParams({
        payload: JSON.stringify(interactionPayload),
      }).toString();

      const request = new Request('https://app.example.com/api/integrations/slack/interactivity', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...createSlackSignatureHeaders(body),
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify feedback was stored
      const admin = require('firebase-admin');
      expect(admin.firestore().collection).toHaveBeenCalledWith('slackFeedback');
    });

    it('should handle regenerate button click', async () => {
      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');

      const interactionPayload = sampleInteractions.regenerate('What is AI?');
      interactionPayload.team.id = mockInstallation.teamId;

      const body = new URLSearchParams({
        payload: JSON.stringify(interactionPayload),
      }).toString();

      const request = new Request('https://app.example.com/api/integrations/slack/interactivity', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify response_url was called to update message
      expect(global.fetch).toHaveBeenCalledWith(
        interactionPayload.response_url,
        expect.anything()
      );
    });

    it('should handle settings modal submission', async () => {
      const { POST } = await import('@/app/api/integrations/slack/interactivity/route');

      const interactionPayload = sampleInteractions.settingsSubmission('detailed', ['daily_summary']);
      interactionPayload.team.id = mockInstallation.teamId;

      const body = new URLSearchParams({
        payload: JSON.stringify(interactionPayload),
      }).toString();

      const request = new Request('https://app.example.com/api/integrations/slack/interactivity', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Empty response closes the modal
      expect(Object.keys(data)).toHaveLength(0);

      // Verify preferences were stored
      const admin = require('firebase-admin');
      expect(admin.firestore().collection).toHaveBeenCalledWith('slackUserPreferences');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should use correct token for each workspace', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const tokenManager = require('@/lib/slack/tokenManager');

      // Setup two different workspaces
      const workspace1 = createMockInstallation({ teamId: 'T_WORKSPACE_1' });
      const workspace2 = createMockInstallation({ teamId: 'T_WORKSPACE_2' });

      // Test workspace 1
      tokenManager.getSlackConfig.mockResolvedValueOnce({
        teamId: workspace1.teamId,
        teamName: workspace1.teamName,
        botToken: workspace1.botToken,
        botUserId: workspace1.botUserId,
        scopes: workspace1.scopes,
      });

      const event1 = sampleEvents.appMention('Hello from workspace 1');
      event1.team_id = workspace1.teamId;

      const request1 = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(event1),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request1);

      expect(tokenManager.getSlackConfig).toHaveBeenCalledWith('T_WORKSPACE_1');

      // Test workspace 2
      tokenManager.getSlackConfig.mockResolvedValueOnce({
        teamId: workspace2.teamId,
        teamName: workspace2.teamName,
        botToken: workspace2.botToken,
        botUserId: workspace2.botUserId,
        scopes: workspace2.scopes,
      });

      const event2 = sampleEvents.appMention('Hello from workspace 2');
      event2.team_id = workspace2.teamId;

      const request2 = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(event2),
        headers: { 'Content-Type': 'application/json' },
      });

      await POST(request2);

      expect(tokenManager.getSlackConfig).toHaveBeenCalledWith('T_WORKSPACE_2');
    });

    it('should reject requests from uninstalled workspaces', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');
      const tokenManager = require('@/lib/slack/tokenManager');

      tokenManager.getSlackConfig.mockRejectedValue(new Error('No installation found'));

      const event = sampleEvents.appMention('Hello');
      event.team_id = 'T_UNINSTALLED';

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.error).toBe('workspace_not_installed');
    });
  });

  describe('Error Recovery', () => {
    it('should handle Slack API errors gracefully', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');

      // Mock Slack API failure
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
      });

      const event = sampleEvents.appMention('Hello');
      event.team_id = mockInstallation.teamId;

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'application/json' },
      });

      // Should not throw
      const response = await POST(request);
      expect(response.status).toBe(200);
    });

    it('should handle AI generation errors gracefully', async () => {
      const { POST } = await import('@/app/api/integrations/slack/events/route');

      // Mock AI failure
      const genAI = require('@google/generative-ai');
      genAI.GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: () => ({
          startChat: () => ({
            sendMessage: jest.fn().mockRejectedValue(new Error('AI Error')),
          }),
        }),
      }));

      const event = sampleEvents.appMention('Hello');
      event.team_id = mockInstallation.teamId;

      const request = new Request('https://app.example.com/api/integrations/slack/events', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'application/json' },
      });

      // Should not throw
      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });
});
