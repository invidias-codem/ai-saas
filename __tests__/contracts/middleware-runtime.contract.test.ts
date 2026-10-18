import { NextRequest, NextResponse } from 'next/server';

// Execute the production callback; retain Clerk's real route matcher and Next responses.
jest.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher: jest.requireActual('@clerk/nextjs/server').createRouteMatcher,
  clerkMiddleware: (callback: unknown) => callback,
}));
jest.mock('next-intl/middleware', () => ({
  __esModule: true,
  default: () => jest.fn(() => NextResponse.next()),
}));
jest.mock('@/lib/supabaseClient', () => ({ supabaseAdmin: null }));

import proxy from '@/proxy';

type AuthResult = { userId: string | null; redirectToSignIn: () => NextResponse };
const runProxy = proxy as unknown as (
  auth: () => Promise<AuthResult>, req: NextRequest,
) => Promise<NextResponse>;
const auth = jest.fn();
const redirectToSignIn = jest.fn(() => NextResponse.redirect('https://app.example/sign-in'));

beforeEach(() => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'production' });
  delete process.env.NEXT_PUBLIC_IS_DESKTOP;
  delete process.env.DEV_BYPASS_TOKEN;
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: null, redirectToSignIn });
});
afterEach(() => jest.restoreAllMocks());

function request(path: string) {
  // proxy.ts reads `new URL(req.url).searchParams`, not `req.nextUrl.searchParams` —
  // keep both in sync so the test's deterministic guest_id lands where the proxy reads it.
  const sep = path.includes('?') ? '&' : '?';
  const req = new NextRequest(`https://app.example${path}${sep}guest_id=guest-runtime-contract`);
  req.nextUrl.searchParams.set('guest_id', 'guest-runtime-contract');
  return runProxy(auth, req);
}

it.each(['/api/admin', '/trpc/private', '/api/code-builder/stream', '/api/memory/private', '/api/webhooks/apify-admin', '/api/webhooks/apify/private'])(
  'rejects unauthenticated protected endpoint %s with JSON, not a redirect', async path => {
    const response = await request(path);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(auth).toHaveBeenCalledTimes(1);
    expect(redirectToSignIn).not.toHaveBeenCalled();
  },
);

it('returns an explicit Next response for an authenticated protected API', async () => {
  auth.mockResolvedValue({ userId: 'user_runtime', redirectToSignIn });
  const response = await request('/api/admin');
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.cookies.get('guest_id')).toBeUndefined();
  expect(auth).toHaveBeenCalledTimes(1);
});

it('redirects an anonymous protected page through Clerk', async () => {
  const response = await request('/en/settings');
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://app.example/sign-in');
  expect(redirectToSignIn).toHaveBeenCalledTimes(1);
});

it('passes an authenticated protected page to locale middleware', async () => {
  auth.mockResolvedValue({ userId: 'user_runtime', redirectToSignIn });
  expect((await request('/en/settings')).headers.get('x-middleware-next')).toBe('1');
  expect(auth).toHaveBeenCalledTimes(1);
  expect(redirectToSignIn).not.toHaveBeenCalled();
});

it.each(['/api/guest-chat', '/api/v1/models', '/api/code', '/en/docs', '/api/webhooks/apify']) (
  'passes public route %s without requiring Clerk identity', async path => {
    const response = await request(path);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.cookies.get('guest_id')).toMatchObject({
      value: 'guest-runtime-contract', httpOnly: true, secure: true, sameSite: 'lax',
    });
    if (path.startsWith('/api/')) expect(response.headers.get('x-guest-id')).toBe('guest-runtime-contract');
    expect(auth).not.toHaveBeenCalled();
  },
);

it.each([
  ['production', 'local-only-token', 'local-only-token', 401],
  ['development', 'local-only-token', 'local-only-token', 200],
  ['development', 'local-only-token', 'wrong', 401],
  ['development', 'local-only-token', '', 401],
  ['development', undefined, 'local-only-token', 401],
] as const)('gates API bypass in %s with configured=%s supplied=%s', async (mode, configured, supplied, status) => {
  Reflect.set(process.env, 'NODE_ENV', mode);
  if (configured) process.env.DEV_BYPASS_TOKEN = configured;
  const response = await request(`/api/admin?dev_token=${supplied}`);
  expect(response.status).toBe(status);
  expect(auth).toHaveBeenCalledTimes(status === 200 ? 0 : 1);
  if (status === 200) expect(response.headers.get('x-middleware-next')).toBe('1');
});

it('does not apply the API dev-token bypass to protected pages', async () => {
  Reflect.set(process.env, 'NODE_ENV', 'development');
  process.env.DEV_BYPASS_TOKEN = 'local-only-token';
  expect((await request('/en/settings?dev_token=local-only-token')).status).toBe(307);
  expect(auth).toHaveBeenCalledTimes(1);
});

it('fails closed when the Clerk boundary throws', async () => {
  const failure = new Error('Clerk unavailable');
  auth.mockRejectedValue(failure);
  await expect(request('/api/admin')).rejects.toBe(failure);
});

// Known production defects: expected-failure assertions keep the desired security
// contract visible and fail on an unexpected pass, requiring removal after repair.
it.failing('requires authentication for non-English protected pages', async () => {
  expect((await request('/fr/settings')).status).toBe(307);
  expect(auth).toHaveBeenCalledTimes(1);
});
it.failing('never lets the desktop flag bypass protected APIs in production', async () => {
  process.env.NEXT_PUBLIC_IS_DESKTOP = 'true';
  expect((await request('/api/admin')).status).toBe(401);
  expect(auth).toHaveBeenCalledTimes(1);
});
