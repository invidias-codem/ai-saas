import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cookies } from 'next/headers';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

export async function GET(req: Request) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !appUrl) {
        console.error('Missing GITHUB_CLIENT_ID or NEXT_PUBLIC_APP_URL');
        return new NextResponse('GitHub Client ID or App URL configuration missing', { status: 500 });
    }

    const redirectUri = `${appUrl}/api/integrations/github/callback`;

    // Scope: 'repo' is required because GitHub OAuth doesn't have a read-only private repo scope.
    // We enforce read-only at the application level WAF layer.
    const scope = 'repo read:user user:email';
    const stateToken = crypto.randomUUID();

    const cookieStore = await cookies();
    cookieStore.set('github_oauth_state', stateToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 10,
        path: '/',
    });

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state: stateToken,
    });

    return NextResponse.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
}
