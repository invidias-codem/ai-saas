import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { appBaseUrl, appUrl } from '@/lib/appUrl';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Sign in to connect GitHub' }, { status: 401 });

  const clientId = process.env.GITHUB_CLIENT_ID;
  const rawBase = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !rawBase) {
    console.error('[GitHub Auth] OAuth client or canonical app URL not configured');
    return NextResponse.json({ error: 'GitHub connection is temporarily unavailable (configuration)' }, { status: 503 });
  }

  let canonical: string;
  try {
    canonical = appBaseUrl(rawBase);
  } catch {
    console.error('[GitHub Auth] Invalid canonical app URL');
    return NextResponse.json({ error: 'GitHub connection is temporarily unavailable (URL configuration)' }, { status: 503 });
  }

  // GitHub callback uses a registered host; cookies created on Preview/aliases
  // are not sent to the canonical host. Redirect BEFORE setting CSRF state.
  if (new URL(req.url).origin !== canonical) {
    return NextResponse.redirect(appUrl('/api/integrations/github/auth', canonical), 307);
  }

  const stateToken = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('github_oauth_state', stateToken, {
    httpOnly: true, secure: canonical.startsWith('https:'),
    sameSite: 'lax', maxAge: 600, path: '/',
  });

  // OAuth's repo scope includes writes. The Lattice tool layer is read-only;
  // migrate to a granular GitHub App after qualifying its installation path.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: appUrl('/api/integrations/github/callback', canonical),
    scope: 'repo read:user user:email',
    state: stateToken,
  });
  return NextResponse.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
}
