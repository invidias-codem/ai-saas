/** GitHub OAuth state cookie must be created on the canonical callback host. */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    redirect: (url: string | URL, status?: number) => ({ redirect: String(url), status: status ?? 307 }),
  },
}));
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn().mockResolvedValue({ userId: 'lattice-user' }),
}));
const mockSetCookie = jest.fn();
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ set: mockSetCookie }),
}));
import { GET } from '@/app/api/integrations/github/auth/route';

const oldClientId = process.env.GITHUB_CLIENT_ID;
const oldBase = process.env.NEXT_PUBLIC_APP_URL;
beforeEach(() => {
  mockSetCookie.mockClear();
  process.env.GITHUB_CLIENT_ID = 'test-client-id';
  process.env.NEXT_PUBLIC_APP_URL = 'https://gen1e.xyz/';
});
afterAll(() => {
  if (oldClientId === undefined) delete process.env.GITHUB_CLIENT_ID;
  else process.env.GITHUB_CLIENT_ID = oldClientId;
  if (oldBase === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = oldBase;
});

describe('Settings GitHub OAuth canonical connection path', () => {
  it('relocates Preview and alias starts before setting any state cookie', async () => {
    const res = await GET(new Request('https://preview-abc.vercel.app/api/integrations/github/auth'));
    expect(res).toEqual({ redirect: 'https://gen1e.xyz/api/integrations/github/auth', status: 307 });
    expect(mockSetCookie).not.toHaveBeenCalled();
  });
  it('uses the exact registered callback and secure Lax CSRF cookie', async () => {
    const res = await GET(new Request('https://gen1e.xyz/api/integrations/github/auth')) as unknown as {
      redirect: string; status: number;
    };
    const uri = new URL(res.redirect);
    expect(uri.origin).toBe('https://github.com');
    expect(uri.searchParams.get('redirect_uri')).toBe('https://gen1e.xyz/api/integrations/github/callback');
    expect(uri.searchParams.get('client_id')).toBe('test-client-id');
    expect(mockSetCookie).toHaveBeenCalledWith('github_oauth_state', expect.any(String), {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
    });
    expect(uri.searchParams.get('state')).toBe(mockSetCookie.mock.calls[0][1]);
  });
  it('fails closed when the canonical URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const res = await GET(new Request('https://gen1e.xyz/api/integrations/github/auth'));
    expect(res.status).toBe(503);
    expect(mockSetCookie).not.toHaveBeenCalled();
  });
});
