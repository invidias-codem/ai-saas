import { NextResponse } from "next/server";
import { requireAuth, handleAuthError, getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { getConversationsForUser } from '@/lib/conversations/list';

// Force dynamic rendering since this route uses Clerk auth
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const user = await requireAuth();
        const ip = getClientIP(req);

        // Rate limiting
        const rateLimit = await limitApiEndpoint(user.userId, ip, 'query');
        if (!rateLimit.success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const payload = await getConversationsForUser();
        return NextResponse.json(payload);
    } catch (error) {
        console.error("[API:Conversations] Error fetching conversations:", error);

        const authResponse = handleAuthError(error);
        if (authResponse) return authResponse;

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
