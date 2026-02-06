/**
 * Slack OAuth Callback Tests
 * Tests for the multi-tenant OAuth flow
 */

// Mock NextResponse before importing the route
jest.mock('next/server', () => ({
  NextResponse: {
    redirect: jest.fn((url: string) => ({
      status: 307,
      headers: new Map([['location', url]]),
    })),
    json: jest.fn((data: any, init?: any) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(data),
    })),
  },
}));

// Mock the token manager
jest.mock('@/lib/slack/tokenManager', () => ({
  saveSlackInstallation: jest.fn(),
  logInstallationEvent: jest.fn(),
  hasInstallation: jest.fn(),
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockDocRef = {
    get: jest.fn().mockResolvedValue({ exists: false }),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const mockSubCollection = {
    doc: jest.fn().mockReturnValue(mockDocRef),
  };

  const mockUserDocRef = {
    collection: jest.fn().mockReturnValue(mockSubCollection),
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockUserDocRef),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn().mockReturnValue({
      collection: jest.fn().mockReturnValue(mockCollection),
    }),
  };
});

// Mock fetch for Slack API calls
global.fetch = jest.fn();

import { GET } from '@/app/api/integrations/slack/callback/route';
import { NextResponse } from 'next/server';

describe('Slack OAuth Callback', () => {
  const mockTokenResponse = {
    ok: true,
    access_token: 'xoxb-test-token-123',
    authed_user: { id: 'U_INSTALLER_123' },
    team: { id: 'T123ABC456', name: 'Test Workspace' },
    bot_user_id: 'U_BOT_123',
    scope: 'chat:write,commands,app_mentions:read',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock for fetch (Slack token exchange)
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve(mockTokenResponse),
    });

    // Setup default mocks for token manager
    const { saveSlackInstallation, logInstallationEvent, hasInstallation } =
      require('@/lib/slack/tokenManager');
    saveSlackInstallation.mockResolvedValue(undefined);
    logInstallationEvent.mockResolvedValue(undefined);
    hasInstallation.mockResolvedValue(false);

    // Set environment variables
    process.env.SLACK_CLIENT_ID = 'test-client-id';
    process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });

  describe('Successful OAuth Flow', () => {
    it('should exchange code for token and save installation', async () => {
      const { saveSlackInstallation } = require('@/lib/slack/tokenManager');

      // Create state with user ID
      const state = Buffer.from(`user_123:${Date.now()}`).toString('base64');

      const request = new Request(
        `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      // Should redirect to settings with success
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_success=true')
      );

      // Should save installation
      expect(saveSlackInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'T123ABC456',
          teamName: 'Test Workspace',
          botToken: 'xoxb-test-token-123',
          botUserId: 'U_BOT_123',
          installedBy: expect.objectContaining({
            slackUserId: 'U_INSTALLER_123',
            clerkUserId: 'user_123',
          }),
        })
      );
    });

    it('should handle public installation (no state)', async () => {
      const { saveSlackInstallation } = require('@/lib/slack/tokenManager');

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_success=true')
      );

      // Should save installation without clerkUserId
      expect(saveSlackInstallation).toHaveBeenCalledWith(
        expect.objectContaining({
          installedBy: expect.objectContaining({
            slackUserId: 'U_INSTALLER_123',
            clerkUserId: undefined,
          }),
        })
      );
    });

    it('should detect reinstallation', async () => {
      const { hasInstallation, logInstallationEvent } = require('@/lib/slack/tokenManager');
      hasInstallation.mockResolvedValue(true);

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(logInstallationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reinstall',
        })
      );
    });

    it('should log new installation', async () => {
      const { hasInstallation, logInstallationEvent } = require('@/lib/slack/tokenManager');
      hasInstallation.mockResolvedValue(false);

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(logInstallationEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'install',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle Slack authorization error', async () => {
      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?error=access_denied',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=access_denied')
      );
    });

    it('should handle missing code', async () => {
      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=missing_code')
      );
    });

    it('should handle expired state', async () => {
      // Create state with old timestamp (11 minutes ago)
      const oldTimestamp = Date.now() - 11 * 60 * 1000;
      const state = Buffer.from(`user_123:${oldTimestamp}`).toString('base64');

      const request = new Request(
        `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=state_expired')
      );
    });

    it('should handle malformed state gracefully', async () => {
      // Use a state that will fail timestamp parsing (no colon separator)
      // The route will proceed but without a valid user ID
      const invalidState = Buffer.from('no_colon_here').toString('base64');

      const request = new Request(
        `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${invalidState}`,
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      // The route proceeds with OAuth flow even with malformed state
      // It just won't have a valid clerkUserId
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_success=true')
      );
    });

    it('should handle token exchange failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: 'invalid_code' }),
      });

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=invalid-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=invalid_code')
      );
    });

    it('should handle incomplete token response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: true,
            // Missing required fields
            team: { id: 'T123' },
          }),
      });

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=incomplete_token_response')
      );
    });

    it('should handle missing environment variables', async () => {
      delete process.env.SLACK_CLIENT_ID;

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=server_configuration_error')
      );
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const request = new Request(
        'https://app.example.com/api/integrations/slack/callback?code=test-code',
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      expect(NextResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('slack_error=callback_failed')
      );
    });
  });

  describe('User Context Update', () => {
    it('should update user context when logged in', async () => {
      const admin = require('firebase-admin');
      const mockSet = admin.firestore().collection().doc().collection().doc().set;

      const state = Buffer.from(`user_123:${Date.now()}`).toString('base64');

      const request = new Request(
        `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
        { method: 'GET' }
      ) as unknown as NextRequest;

      await GET(request);

      // Verify user context was updated
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          'integrations.slackEnabled': true,
          'integrations.slackTeamId': 'T123ABC456',
        }),
        { merge: true }
      );
    });
  });
});
