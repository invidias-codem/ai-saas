/**
 * #447 review P2 — GitHub callback validates configuration BEFORE any
 * provider call or persistence. A missing NEXT_PUBLIC_APP_URL must surface
 * as a configuration error, never fall back to localhost after the code
 * exchange + credential upsert already happened.
 */
jest.mock('next/server', () => {
  class NextRequest {
    nextUrl: URL;
    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  }
  class NextResponse {
    static json(body: unknown, init?: ResponseInit) {
      return { body, status: (init as { status?: number } | undefined)?.status ?? 200 };
    }
    static redirect(url: string | URL, init?: ResponseInit) {
      return { redirect: String(url), status: (init as { status?: number } | undefined)?.status ?? 307 };
    }
  }
  return { NextRequest, NextResponse };
});
jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn().mockResolvedValue({ userId: 'u1' }) }));
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: () => ({ value: 'state-123' }), delete: jest.fn() }),
}));
jest.mock('@/lib/github', () => ({
  exchangeCodeForToken: jest.fn().mockResolvedValue('gh-token'),
  getGitHubUserProfile: jest.fn().mockResolvedValue({ login: 'jj-em', email: 'x@y.z' }),
}));
jest.mock('@/lib/encryption', () => ({ encrypt: jest.fn().mockReturnValue('enc-token') }));
jest.mock('@/lib/supabaseClient', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

import { GET } from '@/app/api/integrations/github/callback/route';
import { exchangeCodeForToken } from '@/lib/github';

const CALLBACK = 'https://gen1e.xyz/api/integrations/github/callback?code=c1&state=state-123';

const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

afterAll(() => {
  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalEnv;
});

describe('callback validates configuration before provider calls or persistence (#447 P2)', () => {
  it('missing NEXT_PUBLIC_APP_URL → configuration error; NO exchange, NO persistence', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = (await GET(new (require('next/server').NextRequest)(CALLBACK) as any)) as unknown as {
      status: number;
      body: Record<string, unknown>;
    };
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain('NEXT_PUBLIC_APP_URL');
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
    const supabase = require('@/lib/supabaseClient').supabaseAdmin;
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('invalid NEXT_PUBLIC_APP_URL → configuration error; NO exchange', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'ftp://gen1e.xyz';
    const res = (await GET(new (require('next/server').NextRequest)(CALLBACK) as any)) as unknown as {
      status: number;
      body: Record<string, unknown>;
    };
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain('NEXT_PUBLIC_APP_URL');
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('a valid base lets the flow proceed past configuration validation', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://gen1e.xyz';
    const res = (await GET(new (require('next/server').NextRequest)(CALLBACK) as any)) as unknown as {
      redirect?: string;
    };
    expect(exchangeCodeForToken).toHaveBeenCalledWith('c1');
    expect(res.redirect).toBe('https://gen1e.xyz/settings?github=connected');
  });
});
