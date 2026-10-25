import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  describeGitHubConnection,
  ConnectionLookupError,
} from "@/lib/integrations/connectionService";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
            // #444: the same connection-state rules the Weaver tools use.
            // `connected` is now derived from an actual provider check — a
            // stored token alone reports unverified/not_connected, never
            // connected. The UI shape (connected/username/email) is preserved.
            const status = await describeGitHubConnection(userId, { verify: true });
            return NextResponse.json({
                connected: status.connected,
                status: status.status,
                username: status.username,
                email: status.email,
                verification: status.verification,
            });
        } catch (error) {
            if (error instanceof ConnectionLookupError) {
                console.error("[GitHub Status] Lookup failed:", error.code, error.message);
                return NextResponse.json(
                    { error: "Failed to check GitHub status" },
                    { status: 500 }
                );
            }
            throw error;
        }
    } catch (error) {
        console.error("[GitHub Status] Error:", error);
        return NextResponse.json(
            { error: "Failed to check GitHub status" },
            { status: 500 }
        );
    }
}
