
import { NextResponse } from 'next/server';

const TRELLO_AUTH_URL = 'https://trello.com/1/authorize';

export async function GET(req: Request) {
    const apiKey = process.env.NEXT_PUBLIC_TRELLO_API_KEY || process.env.TRELLO_API_KEY;
    const appName = "AI Nexus"; // Or from env
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!apiKey) {
        return new NextResponse('Trello API Key missing', { status: 500 });
    }

    // We set return_url to our settings page (or a dedicated handling page)
    // Trello will redirect there with #token=...
    const returnUrl = `${appUrl}/settings?trello=connect`;

    const params = new URLSearchParams({
        expiration: 'never',
        name: appName,
        scope: 'read,write',
        response_type: 'token',
        key: apiKey,
        return_url: returnUrl,
    });

    return NextResponse.redirect(`${TRELLO_AUTH_URL}?${params.toString()}`);
}
