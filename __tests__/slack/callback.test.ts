/**
 * Slack OAuth Callback Tests
 * Multi-tenant OAuth flow. The callback route is a stateless, signature-
 * verified edge function: the `state` param is `userId:timestamp:signature`,
 * where `signature` is an HMAC-SHA256 (base64url) of `userId:timestamp` keyed
 * by SLACK_CLIENT_SECRET. On success it upserts via
 * `supabaseAdmin.rpc('upsert_slack_integration', ...)`.
 */

import type { NextRequest } from 'next/server';
import crypto from 'node:crypto';

// Mock NextResponse before importing the route
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
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
  };
});

// Mock Supabase admin client (the route dynamically imports this)
jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    rpc: jest.fn().mockResolvedValue({ error: null }),
  },
}));

// Mock fetch for Slack API calls (token exchange)
global.fetch = jest.fn();

const CLIENT_SECRET = 'test-client-secret';

/** Build a valid signed state param matching the route's HMAC check. */
function signedState(userId: string, timestamp: number): string {
  const data = `${userId}:${timestamp}`;
  const sig = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}:${sig}`;
}

import { GET } from '@/app/api/integrations/slack/callback/route';
import { NextResponse } from 'next/server';

describe('Slack OAuth Callback', () => {
  const mockTokenResponse = {
    ok: true,
    access_token: 'xoxb-test-token',
    authed_user: { id: 'U_INSTALLER_123' },
    team: { id: 'T123ABC456', name: 'Test Workspace' },
    bot_user_id: 'U_BOT_123',
    scope: 'chat:write,commands,app_mentions:read',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve(mockTokenResponse),
    });
    process.env.SLACK_CLIENT_ID = 'test-client-id';
    process.env.SLACK_CLIENT_SECRET = CLIENT_SECRET;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });

  it('redirects to the slack error page on an OAuth error param', async () => {
    const request = new Request(
      'https://app.example.com/api/integrations/slack/callback?error=access_denied',
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=access_denied')
    );
  });

  it('returns missing_params when code or state is absent', async () => {
    const request = new Request(
      'https://app.example.com/api/integrations/slack/callback',
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=missing_params')
    );
  });

  it('rejects an expired state (timestamp older than 15 min)', async () => {
    const oldTimestamp = Date.now() - 20 * 60 * 1000;
    const state = signedState('user_123', oldTimestamp);

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=state_expired')
    );
  });

  it('rejects a malformed state (invalid signature)', async () => {
    // Recent timestamp (passes the expiry check) but a signature that will not
    // match the HMAC computed from SLACK_CLIENT_SECRET -> invalid_state.
    const badState = `user_123:${Date.now()}:not-a-valid-signature`;

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${badState}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=invalid_state')
    );
  });

  it('exchanges the code, verifies state, and upserts the installation', async () => {
    const { supabaseAdmin } = require('@/lib/supabaseClient');
    const state = signedState('user_123', Date.now());

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_success=true')
    );
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('upsert_slack_integration', {
      p_slack_team_id: 'T123ABC456',
      p_slack_team_name: 'Test Workspace',
      p_access_token: 'xoxb-test-token',
      p_bot_user_id: 'U_BOT_123',
      p_user_id: 'user_123',
      p_encryption_key: expect.any(String),
    });
  });

  it('links a public install (no valid userId) as a system install', async () => {
    const { supabaseAdmin } = require('@/lib/supabaseClient');
    const state = signedState('system', Date.now());

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_success=true')
    );
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
      'upsert_slack_integration',
      expect.objectContaining({ p_user_id: null })
    );
  });

  it('returns the Slack error when token exchange fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: 'invalid_code' }),
    });
    const state = signedState('user_123', Date.now());

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=invalid-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=invalid_code')
    );
  });

  it('returns a db error when the upsert RPC fails', async () => {
    const { supabaseAdmin } = require('@/lib/supabaseClient');
    supabaseAdmin.rpc.mockResolvedValueOnce({ error: { message: 'boom' } });
    const state = signedState('user_123', Date.now());

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=db_error')
    );
  });

  it('surfaces a server error when the client secret is missing', async () => {
    delete process.env.SLACK_CLIENT_SECRET;
    const state = signedState('user_123', Date.now());

    const request = new Request(
      `https://app.example.com/api/integrations/slack/callback?code=test-code&state=${state}`,
      { method: 'GET' }
    ) as unknown as NextRequest;

    await GET(request);

    expect(NextResponse.redirect).toHaveBeenCalledWith(
      expect.stringContaining('slack_error=server_error')
    );
  });
});
