
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

export async function GET(req: Request) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !appUrl) {
        console.error('Missing GITHUB_CLIENT_ID or NEXT_PUBLIC_APP_URL');
        return new NextResponse('GitHub Client ID or App URL configuration missing', { status: 500 });
    }

    const redirectUri = `${appUrl}/api/integrations/github/callback`;

    // Scope: 'repo' for full repository access.
    const scope = 'repo';
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
    });

    return NextResponse.redirect(`${GITHUB_AUTH_URL}?${params.toString()}`);
}
